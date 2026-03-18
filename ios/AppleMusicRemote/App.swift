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
        // connect/disconnect with app lifecycle to avoid ghost connections in the background
        .onChange(of: scenePhase) { phase in
            switch phase {
            case .active:     ws.connect()
            case .background: ws.disconnect()
            default:          break
            }
        }
    }
}
