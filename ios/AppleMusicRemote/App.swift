import SwiftUI

@main
struct AppleMusicRemoteApp: App {
    @StateObject private var ws = WebSocketManager()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(ws)
                .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { phase in
            switch phase {
            case .active:      ws.connect()
            case .background:  ws.disconnect()
            default:           break
            }
        }
    }
}
