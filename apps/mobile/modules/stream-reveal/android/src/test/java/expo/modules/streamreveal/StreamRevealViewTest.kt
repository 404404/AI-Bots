package expo.modules.streamreveal

import android.graphics.Rect
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
  @Test fun parentRelayoutPreservesReactManagedChildBounds() {
    val context = RuntimeEnvironment.getApplication()
    val react: ReactApplicationContext = BridgeReactContext(context)
    val modules = object : ModulesProvider {
      override fun getModulesMap(): Map<Class<out Module>, String?> = emptyMap()
    }
    val app = AppContext(modules, ModuleRegistry(emptyList(), emptyList()), WeakReference(react))
    val parent = StreamRevealView(context, app)
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
}
