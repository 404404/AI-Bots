package expo.modules.streamreveal

import android.graphics.Rect
import android.view.View
import android.widget.TextView
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.BridgeReactContext
import expo.modules.core.ModuleRegistry
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import java.lang.ref.WeakReference
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class StreamRevealViewTest {
  private fun container(): StreamRevealView {
    val context = RuntimeEnvironment.getApplication()
    val react: ReactApplicationContext = BridgeReactContext(context)
    val modules = object : ModulesProvider {
      override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
    }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    return StreamRevealView(context, app)
  }

  @Test fun parentRelayoutPreservesReactManagedChildBounds() {
    val context = RuntimeEnvironment.getApplication()
    val parent = container()
    val text = TextView(context).apply { this.text = "正文".repeat(10000) }
    parent.addView(text)
    val bounds = Rect(13, 17, 848, 69437)
    text.layout(bounds.left, bounds.top, bounds.right, bounds.bottom)
    parent.layout(0, 0, 900, 70000)
    assertEquals(bounds, Rect(text.left, text.top, text.right, text.bottom))
    parent.forceLayout()
    parent.layout(0, 0, 1000, 80000)
    assertEquals(bounds, Rect(text.left, text.top, text.right, text.bottom))
  }

  @Test fun parentMeasurePreservesReactManagedTextMeasurement() {
    val context = RuntimeEnvironment.getApplication()
    var measurements = 0
    val text = object : TextView(context) {
      override fun onMeasure(width: Int, height: Int) {
        measurements++
        super.onMeasure(width, height)
      }
    }.apply { this.text = "Measured paragraph ".repeat(20) }
    val parent = container()
    parent.addView(text)
    val width = View.MeasureSpec.makeMeasureSpec(835, View.MeasureSpec.EXACTLY)
    val height = View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY)
    text.measure(width, height)
    val count = measurements
    val layoutWidth = text.layout.width
    parent.measure(width, height)
    assertEquals(count, measurements)
    assertEquals(835, text.measuredWidth)
    assertEquals(200, text.measuredHeight)
    assertEquals(layoutWidth, text.layout.width)
    assertEquals(835, parent.measuredWidth)
    assertEquals(200, parent.measuredHeight)
  }

  @Test fun delayedFinalParagraphKeepsItsReactManagedSize() {
    val parent = container()
    parent.layout(0, 0, 835, 0)
    val text = TextView(RuntimeEnvironment.getApplication()).apply {
      this.text = "最后一段：REPLAY_COMPLETE。"
    }
    parent.addView(text)
    val width = View.MeasureSpec.makeMeasureSpec(835, View.MeasureSpec.EXACTLY)
    val height = View.MeasureSpec.makeMeasureSpec(65, View.MeasureSpec.EXACTLY)
    text.measure(width, height)
    text.layout(0, 0, 835, 65)
    // A delayed committed suffix mounts after the rest of the Markdown bubble.
    parent.measure(width, height)
    parent.layout(0, 0, 835, 65)
    assertEquals(Rect(0, 0, 835, 65), Rect(text.left, text.top, text.right, text.bottom))
    assertEquals(835, text.measuredWidth)
    assertEquals(65, text.measuredHeight)
  }
}
