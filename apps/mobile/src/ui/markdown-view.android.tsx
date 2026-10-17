import { memo, useMemo } from 'react';
import { Linking, View } from 'react-native';
import { EnrichedMarkdownText, type LinkPressEvent } from 'react-native-enriched-markdown';
import { Lexer } from 'marked';
import remend from 'remend';

import { useDesignTheme } from './design/theme';
import { markdownBlocks, textMarkdownSupported } from './markdown-blocks';
import { MarkdownText } from './markdown-text';
import { markdownStyle } from './markdown-style';
import { space } from './design/tokens';

const flags = { latexMath: false } as const;
const openLink = ({ url }: LinkPressEvent) => void Linking.openURL(url).catch(() => undefined);

const MarkdownBlockView = memo(function MarkdownBlockView({
  source,
  color,
  selectable,
  trailing,
  streaming,
}: {
  source: string;
  color: string;
  selectable: boolean;
  trailing: boolean;
  streaming: boolean;
}) {
  const theme = useDesignTheme();
  const style = useMemo(() => markdownStyle(theme, color), [theme, color]);
  const markdown = useMemo(() => (streaming ? remend(source) : source), [source, streaming]);
  const tokens = useMemo(() => Lexer.lex(markdown, { gfm: true }), [markdown]);
  if (textMarkdownSupported(tokens))
    return (
      <View style={{ marginBottom: trailing ? space.x3 : 0 }}>
        <MarkdownText tokens={tokens} color={color} selectable={selectable} />
      </View>
    );
  return (
    <EnrichedMarkdownText
      markdown={markdown}
      markdownStyle={style}
      flavor="github"
      selectable={selectable}
      md4cFlags={flags}
      allowTrailingMargin={trailing}
      enableTaskListItemToggle={false}
      onLinkPress={openLink}
    />
  );
});

export const MarkdownView = memo(function MarkdownView({
  source,
  color,
  selectable = true,
  streaming = false,
}: {
  source: string;
  color?: string;
  selectable?: boolean;
  streaming?: boolean;
}) {
  const theme = useDesignTheme();
  const blocks = useMemo(() => markdownBlocks(source), [source]);
  return (
    <View>
      {blocks.map((block, index) => (
        <MarkdownBlockView
          key={block.key}
          source={block.source}
          color={color ?? theme.color.fg}
          selectable={selectable}
          trailing={index < blocks.length - 1}
          streaming={streaming && index === blocks.length - 1}
        />
      ))}
    </View>
  );
});
