import { type ReactElement } from 'react';
import { CreatePersonaBotModal } from './persona-bot-create.js';
import { ImportBotZipModal } from './bot-zip.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import type { HomeCreation, HomeCreationRequest } from './home-creation.js';

export function HomeCreationPanel({
  creation,
  request,
  actions,
  t,
  onCreated,
}: {
  creation: HomeCreation;
  request: HomeCreationRequest;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onCreated: () => void;
}): ReactElement {
  const file = creation.file(request);
  const completed = () => {
    creation.complete(request);
    onCreated();
  };
  const props = {
    actions,
    t,
    presentation: 'embedded' as const,
    ...(request.sectionId === undefined ? {} : { sectionId: request.sectionId }),
    ...(request.sectionName === undefined ? {} : { sectionName: request.sectionName }),
    onCancel: () => creation.back(),
    onBusy: (busy: boolean) => creation.setBusy(request, busy),
  };
  return request.source === 'zip' ? (
    <ImportBotZipModal
      {...props}
      {...(file ? { initialFile: file } : {})}
      onFileChange={(file) => creation.setFile(request, file)}
      onImported={completed}
    />
  ) : (
    <CreatePersonaBotModal
      {...props}
      source={request.source}
      draftCache={creation.draft(request)}
      onCreated={completed}
    />
  );
}
