/*
 *  Echo Bridge Speaker (child device driver for the "Echo Bridge" app)
 *
 *  One driver for both kinds of child device:
 *    - a single Echo: speak(text) and playMp3(httpsUrl)
 *    - a zone of Echos: speak(text) only, sent as ONE Amazon announcement
 *
 *  Volume and voice arguments of speak() are accepted (the SpeechSynthesis capability declares
 *  them) but not supported: the Echo uses its current volume and Alexa's voice.
 *
 *  Rule Machine: use "Custom Action" on this device, command speak or playMp3, with one string
 *  parameter (e.g. https://media.example.com/sounds/doorbell.mp3).
 *
 *  Copyright (c) 2026 Nathan Maxwell. MIT License (see LICENSE).
 */
import groovy.transform.Field

metadata {
    definition(name: "Echo Bridge Speaker", namespace: "echobridge", author: "Nathan Maxwell",
               importUrl: "https://raw.githubusercontent.com/ndmax/echo-bridge/main/hubitat/echo-bridge-device.groovy") {
        capability "Actuator"
        capability "SpeechSynthesis"

        command "playMp3", [[name: "url*", type: "STRING", description: "Full public HTTPS URL of an MP3 file"]]

        // Outcome of the last command as reported by the bridge, e.g. "/speak accepted".
        // "accepted" means Amazon accepted the request; it cannot confirm the Echo was heard.
        attribute "lastResult", "string"
    }
    preferences {
        input "logEnable", "bool", title: "Enable debug logging", defaultValue: false
    }
}

@Field static final Integer MAX_TEXT_LENGTH = 250
@Field static final Integer MAX_URL_LENGTH = 200

void installed() {
    sendEvent(name: "lastResult", value: "none")
}

// Untyped volume/voice: callers (dashboards, Rule Machine) may pass numbers or strings.
void speak(String text, volume = null, voice = null) {
    if (volume != null || voice) {
        log.warn "${device.displayName}: volume/voice are not supported; using the Echo's current settings"
    }
    String cleaned = text?.trim()
    if (!cleaned) {
        rejectLocally("/speak", "text is empty")
        return
    }
    if (cleaned.length() > MAX_TEXT_LENGTH) {
        rejectLocally("/speak", "text is longer than ${MAX_TEXT_LENGTH} characters")
        return
    }
    if (logEnable) log.debug "${device.displayName}: speak (${cleaned.length()} characters)"
    parent.sendSpeak(device, cleaned)
}

// The bridge validates the URL fully (HTTPS, allowlisted host, .mp3, no query string).
void playMp3(String url) {
    if (isZone()) {
        rejectLocally("/play", "playMp3 works on single-Echo devices only, not zones")
        return
    }
    String trimmed = url?.trim()
    if (!trimmed?.toLowerCase()?.startsWith("https://") || trimmed.length() > MAX_URL_LENGTH) {
        rejectLocally("/play", "url must be a full https:// URL of at most ${MAX_URL_LENGTH} characters")
        return
    }
    // Do not log the URL itself.
    if (logEnable) log.debug "${device.displayName}: playMp3"
    parent.sendPlay(device, trimmed)
}

// Called by the parent app when the bridge responds.
void bridgeResult(String path, String outcome, String detail) {
    String value = detail ? "${path} ${outcome}: ${detail}" : "${path} ${outcome}"
    sendEvent(name: "lastResult", value: value, descriptionText: "${device.displayName} ${value}")
}

private void rejectLocally(String path, String reason) {
    log.warn "${device.displayName}: ${reason}"
    bridgeResult(path, "rejected", reason)
}

private boolean isZone() {
    return device.getDataValue("isZone") == "true"
}
