/*
 *  Echo Bridge (parent app)
 *
 *  Minimal Hubitat front end for the Echo Bridge Node.js service. It stores the bridge URL and
 *  token, lets you pick Echo devices and define speech zones, and creates one
 *  "Echo Bridge Speaker" child device for each. Children call back into this app, which makes
 *  every HTTP request so the token lives in one place.
 *
 *  Supported: speak(text) on a single Echo or a zone (one Amazon announcement for the whole
 *  zone), and playMp3(httpsUrl) on a single Echo. Nothing else.
 *
 *  Copyright (c) 2026 Nathan Maxwell. MIT License (see LICENSE).
 */
import groovy.json.JsonOutput
import groovy.transform.Field

@Field static final String CHILD_DRIVER = "Echo Bridge Speaker"
@Field static final String NAMESPACE = "echobridge"
@Field static final Integer MAX_ZONES = 10
@Field static final Integer MAX_ZONE_SIZE = 10   // keep in line with the bridge's MAX_ZONE_SIZE

definition(
    name: "Echo Bridge",
    namespace: "echobridge",
    author: "Nathan Maxwell",
    description: "Speak text and play public HTTPS MP3s on Alexa devices through the Echo Bridge service.",
    category: "Convenience",
    iconUrl: "",
    iconX2Url: "",
    singleInstance: true,
    importUrl: "https://raw.githubusercontent.com/ndmax/echo-bridge/main/hubitat/echo-bridge-app.groovy"
)

preferences {
    page(name: "mainPage")
    page(name: "devicesPage")
    page(name: "zonesPage")
}

// ---------- Configuration pages ----------

Map mainPage() {
    dynamicPage(name: "mainPage", title: "Echo Bridge", install: true, uninstall: true) {
        section("Bridge connection") {
            input "bridgeUrl", "text", title: "Bridge URL, e.g. https://echo-bridge.example.lan", required: true, submitOnChange: true
            input "bridgeToken", "password", title: "Bridge token (BRIDGE_TOKEN from the bridge's .env)", required: true, submitOnChange: true
            if (settings.bridgeUrl && !isValidBridgeUrl(settings.bridgeUrl)) {
                paragraph "<b>The bridge URL must start with https:// (put the bridge behind your HTTPS reverse proxy).</b>"
            }
        }
        if (isConfigured()) {
            section("Speakers and zones") {
                href "devicesPage", title: "Choose Echo devices", description: "${(settings.speakerIds ?: []).size()} selected"
                href "zonesPage", title: "Define speech zones", description: "${zoneCountValue()} zone(s)"
            }
        }
        section("Logging") {
            input "logEnable", "bool", title: "Enable debug logging", defaultValue: false
        }
    }
}

Map devicesPage() {
    Map options = fetchSpeakerOptions()
    dynamicPage(name: "devicesPage", title: "Echo devices") {
        section {
            if (state.lastFetchError) paragraph "<b>Could not load devices from the bridge:</b> ${state.lastFetchError}"
            input "speakerIds", "enum", title: "Create a virtual device for each of these Echos",
                options: options, multiple: true, required: false
        }
    }
}

Map zonesPage() {
    Map options = fetchSpeakerOptions()
    dynamicPage(name: "zonesPage", title: "Speech zones") {
        section {
            paragraph "A zone speaks the same text on 2-${MAX_ZONE_SIZE} Echos with one Amazon announcement " +
                "(announcements play a chime first). Zones support speak only, not playMp3."
            if (state.lastFetchError) paragraph "<b>Could not load devices from the bridge:</b> ${state.lastFetchError}"
            input "zoneCount", "number", title: "Number of zones (0-${MAX_ZONES})", range: "0..${MAX_ZONES}",
                defaultValue: 0, submitOnChange: true
        }
        for (int i = 1; i <= zoneCountValue(); i++) {
            section("Zone ${i}") {
                input "zoneName_${i}", "text", title: "Zone name", required: false
                input "zoneMembers_${i}", "enum", title: "Echos in this zone", options: options, multiple: true, required: false
            }
        }
    }
}

// ---------- Lifecycle: create, update and remove child devices ----------

void installed() { initialize() }

void updated() { initialize() }

void uninstalled() {
    getChildDevices().each { deleteChildDevice(it.deviceNetworkId) }
}

void initialize() {
    Map<String, Map> wanted = desiredChildren()
    getChildDevices().each { child ->
        if (!wanted.containsKey(child.deviceNetworkId)) {
            try {
                deleteChildDevice(child.deviceNetworkId)
            } catch (e) {
                log.warn "Echo Bridge: could not remove ${child.displayName} (is it still used by a rule?)"
            }
        }
    }
    wanted.each { String dni, Map spec ->
        def child = getChildDevice(dni)
        if (!child) {
            // The label is only set on creation so renaming the device in Hubitat sticks.
            child = addChildDevice(NAMESPACE, CHILD_DRIVER, dni, [name: spec.label, label: spec.label, isComponent: false])
        }
        child.updateDataValue("targets", JsonOutput.toJson(spec.targets))
        child.updateDataValue("isZone", spec.isZone.toString())
    }
}

// DNI -> [label, targets, isZone]. Single Echos are keyed by Amazon device id, zones by number.
private Map<String, Map> desiredChildren() {
    Map names = state.speakerNames ?: [:]
    Map<String, Map> result = [:]
    (settings.speakerIds ?: []).each { String id ->
        result["echobridge-${id}".toString()] = [label: "Echo ${names[id] ?: id}", targets: [id], isZone: false]
    }
    for (int i = 1; i <= zoneCountValue(); i++) {
        String zoneName = settings["zoneName_${i}"]?.trim()
        List members = settings["zoneMembers_${i}"] ?: []
        if (!zoneName) continue
        if (members.size() < 2 || members.size() > MAX_ZONE_SIZE) {
            log.warn "Echo Bridge: zone '${zoneName}' needs 2-${MAX_ZONE_SIZE} Echos; not created"
            continue
        }
        result["echobridge-zone-${i}".toString()] = [label: "Zone ${zoneName}", targets: members, isZone: true]
    }
    return result
}

// ---------- Called by child devices ----------

void sendSpeak(child, String text) {
    postToBridge(child, "/speak", [targets: childTargets(child), text: text])
}

void sendPlay(child, String url) {
    postToBridge(child, "/play", [target: childTargets(child)[0], url: url])
}

// One asynchronous request per command; failures are reported, never retried.
private void postToBridge(child, String path, Map body) {
    if (!isConfigured()) {
        child.bridgeResult(path, "failed", "bridge URL/token not configured")
        return
    }
    Map params = bridgeParams(path) + [body: body, requestContentType: "application/json"]
    if (settings.logEnable) log.debug "Echo Bridge: POST ${path} for ${child.displayName}"
    asynchttpPost("handleBridgeResponse", params, [dni: child.deviceNetworkId, path: path])
}

void handleBridgeResponse(resp, Map data) {
    def child = getChildDevice(data.dni)
    if (resp.status == 200) {
        child?.bridgeResult(data.path, "accepted", null)
        return
    }
    String detail = "HTTP ${resp.status} ${bridgeErrorCode(resp)}".trim()
    log.warn "Echo Bridge: ${data.path} failed for ${child?.displayName}: ${detail}"
    child?.bridgeResult(data.path, "failed", detail)
}

// ---------- Helpers ----------

// Synchronous GET is acceptable here: it only runs while the user has a settings page open.
private Map fetchSpeakerOptions() {
    state.remove("lastFetchError")
    if (!isConfigured()) return state.speakerNames ?: [:]
    try {
        Map options = [:]
        httpGet(bridgeParams("/devices")) { resp ->
            resp.data.devices.each { d -> options[d.id] = (d.online ? d.name : "${d.name} (offline)").toString() }
        }
        state.speakerNames = options
        return options
    } catch (e) {
        // getClass() is blocked in the Hubitat sandbox, so report the message only.
        state.lastFetchError = e.message ?: "request failed"
        return state.speakerNames ?: [:]
    }
}

// Never log this map: it contains the bridge token.
private Map bridgeParams(String path) {
    return [
        uri: settings.bridgeUrl.trim().replaceAll(/\/+$/, ""),
        path: path,
        contentType: "application/json",
        headers: [Authorization: "Bearer ${settings.bridgeToken}"],
        timeout: 15
    ]
}

private String bridgeErrorCode(resp) {
    try {
        def body = parseJson(resp.getErrorData())
        return body?.error ?: ""
    } catch (ignored) {
        return resp.hasError() ? (resp.getErrorMessage() ?: "") : ""
    }
}

private List childTargets(child) {
    return parseJson(child.getDataValue("targets") ?: "[]")
}

private boolean isValidBridgeUrl(String url) {
    return url?.trim()?.toLowerCase()?.startsWith("https://")
}

private boolean isConfigured() {
    return isValidBridgeUrl(settings.bridgeUrl) && settings.bridgeToken != null && settings.bridgeToken != ""
}

private Integer zoneCountValue() {
    Integer count = (settings.zoneCount ?: 0) as Integer
    return Math.max(0, Math.min(count, MAX_ZONES))
}
