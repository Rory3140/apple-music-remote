import Foundation

struct MusicState {
    var isPlaying   = false
    var currentTime: Double = 0
    var duration:    Double = 0
    var title  = ""
    var artist = ""
    var album  = ""
    var artworkURL: URL? = nil
    var repeatMode  = 0   // 0 = none, 1 = one, 2 = all
    var shuffleMode = 0   // 0 = off,  1 = on
    var queue: [QueueItem] = []
}

struct QueueItem: Identifiable {
    let id = UUID()
    let title:      String
    let artist:     String
    let artworkURL: URL?
}
