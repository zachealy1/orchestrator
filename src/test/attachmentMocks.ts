import type { Mock } from "vitest";

export function prepareAttachmentMocks(mocks: {
  prepareGoalContextMock: Mock;
  discardGoalContextMock: Mock;
  prepareImageAttachmentMock: Mock;
}) {
  mocks.prepareGoalContextMock.mockImplementation(async ({ objective, contextJson, imagePaths }) => ({
    objective: contextJson || imagePaths.length ? `${objective}\n\nReferenced supporting context: /codex/attachments/goal-context.json` : objective,
    directoryPath: contextJson || imagePaths.length ? "/codex/attachments/goal-context" : null,
    files: [],
  }));
  mocks.discardGoalContextMock.mockResolvedValue(undefined);
  mocks.prepareImageAttachmentMock.mockImplementation(async (path: string) =>
    /\.(?:gif|jpe?g|png|webp)$/i.test(path)
      ? {
          path,
          mimeType: "image/png",
          width: 640,
          height: 480,
          thumbnailDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
        }
      : null,
  );
}
