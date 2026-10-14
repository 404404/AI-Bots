import type { PairingRefusal } from '../host/pairing';
import type { AggregatedState } from '../host/wire';

const en = {
  roster: 'DeepSeekBot',
  bots: 'PersonaBots',
  channels: 'Channels',
  noBots: 'No PersonaBots on this computer yet.',
  connecting: 'Connecting to your computer…',
  reconnecting: 'Reconnecting…',
  unreachable: 'Cannot reach your computer',
  refused: 'Your computer refused this app',
  pairAgain: 'Pair again',
  retry: 'Retry',
  tried: 'Tried',
  paused: 'Paused',
  members: (count: number) => `${count} members`,
  state: {
    idle: 'Idle',
    thinking: 'Thinking',
    working: 'Working',
    waiting: 'Waiting for you',
    blocked: 'Blocked',
  } satisfies Record<AggregatedState, string>,
  pairTitle: 'Pair with your computer',
  pairHint:
    'On your computer, open DeepSeekBot settings → Devices → Pair a phone, then scan the code.',
  allowCamera: 'Allow the camera to scan',
  pasteLink: 'Or paste the pairing link',
  pair: 'Pair',
  pairRefused: {
    'link-invalid': 'This is not a DeepSeekBot pairing code.',
    'link-expired': 'This code has expired. Show a new code on your computer.',
    'no-route':
      'Your computer offered no address this phone can use. Set up Tailscale on it first.',
    'offer-invalid': 'This code was already used. Show a new code on your computer.',
    'offer-expired': 'This code has expired. Show a new code on your computer.',
    unreachable: 'Cannot reach your computer. Check that this phone is on your tailnet.',
  } satisfies Record<PairingRefusal, string>,
  unpair: 'Unpair',
  openFullClient: 'Open full client',
  fullClient: 'Full client',
  done: 'Done',
  fullClientRevoked: "Your computer revoked this phone's access, so the full client closed too.",
  fullClientUnreachable: 'The full client could not load from your computer.',
};

const zh: typeof en = {
  roster: 'DeepSeekBot',
  bots: 'PersonaBot',
  channels: '频道',
  noBots: '这台电脑上还没有 PersonaBot。',
  connecting: '正在连接你的电脑…',
  reconnecting: '正在重新连接…',
  unreachable: '无法连接到你的电脑',
  refused: '你的电脑拒绝了这个应用',
  pairAgain: '重新配对',
  retry: '重试',
  tried: '尝试的地址',
  paused: '已暂停',
  members: (count: number) => `${count} 位成员`,
  state: {
    idle: '空闲',
    thinking: '思考中',
    working: '工作中',
    waiting: '等你处理',
    blocked: '受阻',
  },
  pairTitle: '与电脑配对',
  pairHint: '在电脑上打开 DeepSeekBot 设置 → 设备 → 配对手机，然后扫描二维码。',
  allowCamera: '允许使用相机扫码',
  pasteLink: '或粘贴配对链接',
  pair: '配对',
  pairRefused: {
    'link-invalid': '这不是 DeepSeekBot 的配对二维码。',
    'link-expired': '二维码已失效，请在电脑上换一个。',
    'no-route': '电脑没有提供手机能用的地址，请先在电脑上设置 Tailscale。',
    'offer-invalid': '这个二维码已经用过了，请在电脑上换一个。',
    'offer-expired': '二维码已失效，请在电脑上换一个。',
    unreachable: '连不上你的电脑，请确认手机已加入你的 tailnet。',
  },
  unpair: '取消配对',
  openFullClient: '打开完整网页端',
  fullClient: '完整网页端',
  done: '完成',
  fullClientRevoked: '电脑已撤销这台手机的访问权限，完整网页端也随之关闭。',
  fullClientUnreachable: '完整网页端没能从你的电脑加载出来。',
};

const locale = Intl.DateTimeFormat().resolvedOptions().locale;

export const t = locale.toLowerCase().startsWith('zh') ? zh : en;
