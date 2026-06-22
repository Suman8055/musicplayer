import UIKit
import Capacitor
import AVFoundation
import MediaPlayer
import WebKit
import os.log

private let log      = OSLog(subsystem: "com.suman.musicplayer", category: "App")
private let jsLog    = OSLog(subsystem: "com.suman.musicplayer", category: "JS")
private let testLog  = OSLog(subsystem: "com.suman.musicplayer", category: "AutoTest")

// ── JS → os_log bridge ───────────────────────────────────────────────────────
// Receives messages posted by JS via window.webkit.messageHandlers.mbxLog.postMessage(...)
// Routes them to os_log so xcrun simctl log stream can capture them.
class MBXLogHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ ctrl: WKUserContentController, didReceive msg: WKScriptMessage) {
        guard let body = msg.body as? String else { return }
        if body.hasPrefix("[AUTOTEST") {
            os_log("%{public}@", log: testLog, type: .info, body)
        } else {
            os_log("%{public}@", log: jsLog, type: .info, body)
        }
    }
}

private let _logHandler = MBXLogHandler()

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        os_log("MusicPlayer launched", log: log, type: .info)

        // Register JS→os_log bridge so xcrun log stream can capture JS console output.
        // JS calls: window.webkit.messageHandlers.mbxLog.postMessage(str)
        // Capacitor exposes the WKWebView's userContentController via the bridge.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            if let vc = self.window?.rootViewController as? CAPBridgeViewController {
                vc.bridge?.webView?.configuration.userContentController
                    .add(_logHandler, name: "mbxLog")
                os_log("mbxLog message handler registered", log: log, type: .info)
            }
        }

        // Enable background audio + CarPlay/Bluetooth/AirPlay routing.
        // .allowBluetooth + .allowAirPlay ensure the session routes through CarPlay head units.
        // .mixWithOthers is intentionally absent — a music player should take exclusive focus.
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.allowBluetooth, .allowAirPlay]
            )
            try AVAudioSession.sharedInstance().setActive(true)
            os_log("AVAudioSession.playback active (CarPlay-ready)", log: log, type: .info)
        } catch {
            os_log("AVAudioSession setup failed: %{public}@", log: log, type: .error, error.localizedDescription)
        }

        // Observe AVAudioSession interruptions (calls, Siri) and resume on CarPlay.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(_audioSessionInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )

        return true
    }

    @objc private func _audioSessionInterruption(_ notification: Notification) {
        guard let typeVal = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: typeVal) else { return }
        if type == .ended {
            let shouldResume = (notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt)
                .flatMap { AVAudioSession.InterruptionOptions(rawValue: $0) }
                .map { $0.contains(.shouldResume) } ?? false
            if shouldResume {
                try? AVAudioSession.sharedInstance().setActive(true)
                os_log("AVAudioSession resumed after interruption", log: log, type: .info)
                // Notify the JS layer so Web Audio context can resume
                if let vc = window?.rootViewController as? CAPBridgeViewController {
                    vc.bridge?.webView?.evaluateJavaScript("window._mbxResumeAudio && window._mbxResumeAudio()", completionHandler: nil)
                }
            }
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
