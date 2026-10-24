import UIKit
import Capacitor
import FBSDKCoreKit
import GoogleSignIn

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = VirasatBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Google's and Facebook's sign-in sheets finish by opening the app
        // with a URL of their own. Hand those back to their SDKs; anything
        // else goes to Capacitor as before.
        let others = URLContexts.filter { context in
            let url = context.url
            let byFacebook = FacebookSetup.isConfigured && FBSDKCoreKit.ApplicationDelegate.shared.application(
                UIApplication.shared,
                open: url,
                sourceApplication: context.options.sourceApplication,
                annotation: context.options.annotation
            )
            return !(byFacebook || GIDSignIn.sharedInstance.handle(url))
        }
        if !others.isEmpty {
            SceneDelegateProxy.shared.scene(scene, openURLContexts: others)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
