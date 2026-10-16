// Standalone Simulator diagnostic; no React Native, registration, or app state.
#import <UIKit/UIKit.h>
#import <CoreText/CoreText.h>

int main(void) {
  @autoreleasepool {
    NSString *text = @"中文设置匿名统计测试";
    NSAttributedString *sample = [[NSAttributedString alloc]
      initWithString:text attributes:@{NSFontAttributeName:[UIFont systemFontOfSize:24]}];
    CTLineRef line = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)sample);
    int missing = 0, count = 0;
    NSMutableSet *unique = [NSMutableSet set];
    for (id object in (__bridge NSArray *)CTLineGetGlyphRuns(line)) {
      CTRunRef run = (__bridge CTRunRef)object;
      NSDictionary *attributes = (__bridge NSDictionary *)CTRunGetAttributes(run);
      CTFontRef font = (__bridge CTFontRef)attributes[(id)kCTFontAttributeName];
      NSString *name = CFBridgingRelease(CTFontCopyPostScriptName(font));
      CFIndex length = CTRunGetGlyphCount(run);
      CGGlyph glyphs[length];
      CTRunGetGlyphs(run, CFRangeMake(0, length), glyphs);
      printf("font=%s glyphs=", name.UTF8String);
      for (int i=0; i<length; i++) {
        printf("%u,", glyphs[i]);
        [unique addObject:@(glyphs[i])];
        if (!glyphs[i] || [name containsString:@"LastResort"]) missing++;
        count++;
      }
      printf("\n");
    }
    if (unique.count < 2) missing = count;
    BOOL failed = missing > 0 || count != text.length;
    printf("RESULT %s missing=%d count=%d unique=%lu\n",
      failed ? "FAIL" : "PASS", missing, count, (unsigned long)unique.count);
    CFRelease(line);
    return failed ? 1 : 0;
  }
}
