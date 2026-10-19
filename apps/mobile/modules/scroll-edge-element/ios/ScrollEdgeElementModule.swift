import ExpoModulesCore
import UIKit

public final class ScrollEdgeElementModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ScrollEdgeElement")

    View(ScrollEdgeElementView.self) {
      Prop("edge") { (view: ScrollEdgeElementView, edge: String) in
        view.edge = edge == "top" ? .top : .bottom
      }
      Prop("revision") { (view: ScrollEdgeElementView, _: String) in
        view.refresh()
      }
    }
  }
}

final class ScrollEdgeElementView: ExpoView {
  var edge: UIRectEdge = .bottom {
    didSet { attach() }
  }

  private var interaction: UIInteraction?

  override func didMoveToWindow() {
    super.didMoveToWindow()
    NotificationCenter.default.removeObserver(self)
    if window != nil {
      for name in [UIResponder.keyboardDidShowNotification, UIResponder.keyboardDidHideNotification] {
        NotificationCenter.default.addObserver(
          self, selector: #selector(keyboardSettled), name: name, object: nil)
      }
    }
    attach()
  }

  @objc private func keyboardSettled() {
    refresh()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    attach()
  }

  func refresh() {
    if let interaction { removeInteraction(interaction) }
    interaction = nil
    DispatchQueue.main.async { [weak self] in self?.attach() }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
      guard let self, let interaction = self.interaction else { return }
      self.removeInteraction(interaction)
      self.interaction = nil
      self.attach()
    }
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
