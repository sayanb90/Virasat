import UIKit
import Capacitor

/// The app's root: Capacitor's web view, plus what Virasat adds natively.
///
/// - Registers VirasatDevicePlugin. A plugin in the app target is not found
///   by `cap sync`, so it is registered by hand before the web app loads.
/// - Covers the screen whenever the app stops being active, so the app
///   switcher's snapshot shows the wordmark, not someone's notes.
class VirasatBridgeViewController: CAPBridgeViewController {
    private var cover: UIView?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VirasatDevicePlugin())
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(coverContents), name: UIScene.willDeactivateNotification, object: nil)
        center.addObserver(self, selector: #selector(uncoverContents), name: UIScene.didActivateNotification, object: nil)
    }

    @objc private func coverContents() {
        guard cover == nil else { return }
        let host: UIView = view.window ?? view
        let cover = UIView(frame: host.bounds)
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        // The header's ink, #0b2733.
        cover.backgroundColor = UIColor(red: 11 / 255, green: 39 / 255, blue: 51 / 255, alpha: 1)
        let wordmark = UILabel()
        wordmark.text = "Virasat"
        wordmark.textColor = .white
        wordmark.font = UIFont(name: "Georgia", size: 34) ?? .systemFont(ofSize: 34, weight: .semibold)
        wordmark.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(wordmark)
        NSLayoutConstraint.activate([
            wordmark.centerXAnchor.constraint(equalTo: cover.centerXAnchor),
            wordmark.centerYAnchor.constraint(equalTo: cover.centerYAnchor)
        ])
        host.addSubview(cover)
        self.cover = cover
    }

    @objc private func uncoverContents() {
        cover?.removeFromSuperview()
        cover = nil
    }
}
