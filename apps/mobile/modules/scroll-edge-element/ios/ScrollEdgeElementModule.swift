import ExpoModulesCore
import UIKit

public final class ScrollEdgeElementModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScrollEdgeElement")

    View(ScrollEdgeElementView.self) {
      Prop("edge") { (view: ScrollEdgeElementView, edge: String) in
        view.edge = edge == "top" ? .top : .bottom
      }
      Prop("marker") { (view: ScrollEdgeElementView, marker: String) in
        view.marker = marker
      }
    }
  }
}

final class ScrollEdgeElementView: ExpoView {
  var edge: UIRectEdge = .bottom {
    didSet { attach() }
  }

  var marker = "none" {
    didSet { updateMarker() }
  }

  private var interaction: UIInteraction?
  private var markerView: UIView?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    attach()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if let markerView {
      markerView.frame = bounds
      if subviews.last !== markerView { bringSubviewToFront(markerView) }
    }
    attach()
  }

  private func updateMarker() {
    markerView?.removeFromSuperview()
    markerView = nil
    let view: UIView
    switch marker {
    case "label":
      let label = UILabel()
      label.text = " "
      view = label
    case "fill":
      view = UIView()
      view.backgroundColor = UIColor.black.withAlphaComponent(0.011)
    default:
      return
    }
    view.isUserInteractionEnabled = false
    view.isAccessibilityElement = false
    addSubview(view)
    markerView = view
    setNeedsLayout()
  }

  private func attach() {
    guard #available(iOS 26.0, *) else { return }
    guard window != nil, let scrollView = nearestScrollView() else { return }
    let current = interaction as? UIScrollEdgeElementContainerInteraction
    if let current, current.scrollView === scrollView, current.edge == edge { return }
    if let current { removeInteraction(current) }
    let next = UIScrollEdgeElementContainerInteraction()
    next.scrollView = scrollView
    next.edge = edge
    addInteraction(next)
    interaction = next
  }

  private func nearestScrollView() -> UIScrollView? {
    var child: UIView = self
    while let parent = child.superview {
      for sibling in parent.subviews where sibling !== child {
        if let found = largestScrollView(in: sibling) { return found }
      }
      child = parent
    }
    return nil
  }

  private func largestScrollView(in root: UIView) -> UIScrollView? {
    var best: UIScrollView?
    var queue: [UIView] = [root]
    while !queue.isEmpty {
      let view = queue.removeFirst()
      if let scrollView = view as? UIScrollView, !(view is UITextView) {
        if best == nil || scrollView.bounds.height > best!.bounds.height { best = scrollView }
        continue
      }
      queue.append(contentsOf: view.subviews)
    }
    return best
  }
}
