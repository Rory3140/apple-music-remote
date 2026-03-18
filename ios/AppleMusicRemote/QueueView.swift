import SwiftUI

struct QueueView: View {
    let queue: [QueueItem]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 28/255, green: 28/255, blue: 30/255).ignoresSafeArea()

                if queue.isEmpty {
                    Text("Nothing queued")
                        .font(.system(size: 14))
                        .foregroundColor(Color(white: 0.55))
                } else {
                    List(queue) { item in
                        HStack(spacing: 12) {
                            artwork(url: item.artworkURL)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundColor(.white)
                                    .lineLimit(1)
                                Text(item.artist)
                                    .font(.system(size: 13))
                                    .foregroundColor(Color(white: 0.55))
                                    .lineLimit(1)
                            }
                        }
                        .listRowBackground(Color(red: 28/255, green: 28/255, blue: 30/255))
                        .listRowSeparatorTint(Color.white.opacity(0.06))
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Up Next")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(Color(red: 252/255, green: 60/255, blue: 68/255))
                }
            }
        }
        // half-sheet by default, user can pull to full screen
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .preferredColorScheme(.dark)
    }

    // @ViewBuilder lets us conditionally return different view types without wrapping in AnyView
    @ViewBuilder
    private func artwork(url: URL?) -> some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().aspectRatio(contentMode: .fill)
                    default: Color(red: 34/255, green: 34/255, blue: 34/255)
                    }
                }
            } else {
                Color(red: 34/255, green: 34/255, blue: 34/255)
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}
