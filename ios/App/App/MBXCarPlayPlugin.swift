import Capacitor
import Foundation
import os.log

private let log = OSLog(subsystem: "com.suman.musicplayer", category: "CarPlayPlugin")

// MARK: - MBXCarPlayPlugin
// Capacitor plugin that bridges JS ↔ native CarPlay layer.
//
// JS calls (from playback.js / +layout.svelte):
//   MBXCarPlay.updateNowPlaying({ title, artist, duration, elapsed, artworkBase64? })
//   MBXCarPlay.updatePlaybackState({ isPlaying })
//
// JS receives (via addListener):
//   MBXCarPlay.addListener('carplayCommand', ({ event }) => { ... })
//   event values: 'play' | 'pause' | 'next' | 'prev' | 'seekBackward' | 'seekForward'

@objc(MBXCarPlayPlugin)
public class MBXCarPlayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MBXCarPlayPlugin"
    public let jsName = "MBXCarPlay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateNowPlaying",   returnType: CAPPluginReturnNone),
        CAPPluginMethod(name: "updatePlaybackState", returnType: CAPPluginReturnNone),
    ]

    private var _observer: NSObjectProtocol?

    public override func load() {
        // Listen for native CarPlay events and forward to JS listeners
        _observer = NotificationCenter.default.addObserver(
            forName: .mbxCarPlayEvent,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let event = notification.userInfo?["event"] as? String else { return }
            os_log("CarPlayPlugin: forwarding event to JS — %{public}@", log: log, type: .info, event)
            self?.notifyListeners("carplayCommand", data: ["event": event])
        }
    }

    deinit {
        if let obs = _observer { NotificationCenter.default.removeObserver(obs) }
    }

    @objc func updateNowPlaying(_ call: CAPPluginCall) {
        let title    = call.getString("title")    ?? ""
        let artist   = call.getString("artist")   ?? ""
        let duration = call.getDouble("duration") ?? 0
        let elapsed  = call.getDouble("elapsed")  ?? 0
        let b64      = call.getString("artworkBase64")

        var artworkData: Data? = nil
        if let b64 = b64, !b64.isEmpty {
            // Strip optional data: URI prefix
            let raw = b64.components(separatedBy: ",").last ?? b64
            artworkData = Data(base64Encoded: raw)
        }

        DispatchQueue.main.async {
            MBXCarPlayBridge.shared.updateNowPlaying(
                title: title, artist: artist,
                duration: duration, elapsed: elapsed,
                artworkData: artworkData
            )
        }
    }

    @objc func updatePlaybackState(_ call: CAPPluginCall) {
        let isPlaying = call.getBool("isPlaying") ?? false
        DispatchQueue.main.async {
            MBXCarPlayBridge.shared.updatePlaybackState(isPlaying: isPlaying)
        }
    }
}
