import CarPlay
import MediaPlayer
import UIKit
import os.log

private let log = OSLog(subsystem: "com.suman.musicplayer", category: "CarPlay")

// MARK: - CarPlay Scene Delegate

class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate, MBXCarPlayBridgeDelegate {

    var interfaceController: CPInterfaceController?

    // MARK: Connection / Disconnection

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didConnect interfaceController: CPInterfaceController) {
        self.interfaceController = interfaceController
        os_log("CarPlay connected", log: log, type: .info)

        MBXCarPlayBridge.shared.delegate = self

        _registerRemoteCommands()
        _setRootTemplate()
    }

    func templateApplicationScene(_ templateApplicationScene: CPTemplateApplicationScene,
                                  didDisconnect interfaceController: CPInterfaceController) {
        os_log("CarPlay disconnected", log: log, type: .info)
        MBXCarPlayBridge.shared.delegate = nil
        self.interfaceController = nil
        _unregisterRemoteCommands()
    }

    // MARK: Root Template

    private func _setRootTemplate() {
        guard let ic = interfaceController else { return }
        // CPNowPlayingTemplate is a singleton — use it as the only root for an audio app.
        let np = CPNowPlayingTemplate.shared
        np.isUpNextButtonEnabled = false
        np.isAlbumArtistButtonEnabled = false
        ic.setRootTemplate(np, animated: false, completion: nil)
        os_log("CarPlay: CPNowPlayingTemplate set as root", log: log, type: .info)
    }

    // MARK: Now Playing Info Update (called by MBXCarPlayBridge)

    func updateNowPlaying(title: String, artist: String, duration: Double, elapsed: Double, artworkData: Data?) {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle:            title,
            MPMediaItemPropertyArtist:           artist,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyPlaybackRate: 1.0,
        ]
        if let data = artworkData, let img = UIImage(data: data) {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        os_log("CarPlay: MPNowPlayingInfoCenter updated — %{public}@", log: log, type: .debug, title)
    }

    func updatePlaybackState(isPlaying: Bool) {
        MPNowPlayingInfoCenter.default().playbackState = isPlaying ? .playing : .paused
    }

    // MARK: MPRemoteCommandCenter

    private func _registerRemoteCommands() {
        let rc = MPRemoteCommandCenter.shared()

        rc.playCommand.isEnabled = true
        rc.playCommand.addTarget { [weak self] _ in
            os_log("CarPlay: play command", log: log, type: .info)
            MBXCarPlayBridge.shared.sendToJS(event: "play")
            return .success
        }

        rc.pauseCommand.isEnabled = true
        rc.pauseCommand.addTarget { [weak self] _ in
            os_log("CarPlay: pause command", log: log, type: .info)
            MBXCarPlayBridge.shared.sendToJS(event: "pause")
            return .success
        }

        rc.nextTrackCommand.isEnabled = true
        rc.nextTrackCommand.addTarget { [weak self] _ in
            os_log("CarPlay: nextTrack command", log: log, type: .info)
            MBXCarPlayBridge.shared.sendToJS(event: "next")
            return .success
        }

        rc.previousTrackCommand.isEnabled = true
        rc.previousTrackCommand.addTarget { [weak self] _ in
            os_log("CarPlay: previousTrack command", log: log, type: .info)
            MBXCarPlayBridge.shared.sendToJS(event: "prev")
            return .success
        }

        rc.changePlaybackPositionCommand.isEnabled = true
        rc.changePlaybackPositionCommand.addTarget { _ in
            // Handled by CPNowPlayingTemplate scrubber — no JS event needed,
            // MPNowPlayingInfoCenter elapsed time is updated on timeupdate from JS.
            return .success
        }

        rc.skipBackwardCommand.isEnabled = true
        rc.skipBackwardCommand.preferredIntervals = [15]
        rc.skipBackwardCommand.addTarget { _ in
            MBXCarPlayBridge.shared.sendToJS(event: "seekBackward")
            return .success
        }

        rc.skipForwardCommand.isEnabled = true
        rc.skipForwardCommand.preferredIntervals = [15]
        rc.skipForwardCommand.addTarget { _ in
            MBXCarPlayBridge.shared.sendToJS(event: "seekForward")
            return .success
        }

        os_log("CarPlay: MPRemoteCommandCenter registered", log: log, type: .info)
    }

    private func _unregisterRemoteCommands() {
        let rc = MPRemoteCommandCenter.shared()
        rc.playCommand.removeTarget(nil)
        rc.pauseCommand.removeTarget(nil)
        rc.nextTrackCommand.removeTarget(nil)
        rc.previousTrackCommand.removeTarget(nil)
        rc.changePlaybackPositionCommand.removeTarget(nil)
        rc.skipBackwardCommand.removeTarget(nil)
        rc.skipForwardCommand.removeTarget(nil)
    }
}

// MARK: - CarPlay Bridge (singleton — shared between CarPlaySceneDelegate and Capacitor plugin)

protocol MBXCarPlayBridgeDelegate: AnyObject {
    func updateNowPlaying(title: String, artist: String, duration: Double, elapsed: Double, artworkData: Data?)
    func updatePlaybackState(isPlaying: Bool)
}

class MBXCarPlayBridge {
    static let shared = MBXCarPlayBridge()
    weak var delegate: MBXCarPlayBridgeDelegate?

    // JS → native: called by MBXCarPlayPlugin
    func updateNowPlaying(title: String, artist: String, duration: Double, elapsed: Double, artworkData: Data?) {
        delegate?.updateNowPlaying(title: title, artist: artist, duration: duration, elapsed: elapsed, artworkData: artworkData)
        // Also keep MPNowPlayingInfoCenter updated even when CarPlay isn't connected (lock screen)
        var info: [String: Any] = [
            MPMediaItemPropertyTitle:            title,
            MPMediaItemPropertyArtist:           artist,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyPlaybackRate: 1.0,
        ]
        if let data = artworkData, let img = UIImage(data: data) {
            info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    func updatePlaybackState(isPlaying: Bool) {
        delegate?.updatePlaybackState(isPlaying: isPlaying)
        MPNowPlayingInfoCenter.default().playbackState = isPlaying ? .playing : .paused
    }

    // native → JS: called by MPRemoteCommandCenter handlers
    // The Capacitor plugin listens to these via NotificationCenter and forwards to JS.
    func sendToJS(event: String) {
        NotificationCenter.default.post(name: .mbxCarPlayEvent, object: nil, userInfo: ["event": event])
    }
}

extension Notification.Name {
    static let mbxCarPlayEvent = Notification.Name("MBXCarPlayEvent")
}
