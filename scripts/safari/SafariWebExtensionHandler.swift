import Cocoa
import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private var notificationSound: NSSound?

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey]
        var responsePayload: Any = ["echo": message as Any]

        if let dictionary = message as? [String: Any], dictionary["type"] as? String == "play-sound" {
            do {
                try playNotificationSound()
                responsePayload = ["ok": true]
            } catch {
                responsePayload = ["ok": false, "error": error.localizedDescription]
            }
        }

        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: responsePayload]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    private func playNotificationSound() throws {
        guard let url = Bundle.main.url(forResource: "beep", withExtension: "wav", subdirectory: "sound") else {
            throw NSError(domain: "OnlinerNotifier", code: 1, userInfo: [NSLocalizedDescriptionKey: "Sound file not found"])
        }
        guard let sound = NSSound(contentsOf: url, byReference: false) else {
            throw NSError(domain: "OnlinerNotifier", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot load sound"])
        }
        notificationSound = sound
        if !sound.play() {
            throw NSError(domain: "OnlinerNotifier", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot play sound"])
        }
    }
}
