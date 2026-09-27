import {
  applySavePayload,
  createSavePayload
} from "../../../../src/state/save_payload";
type SavePayload = ReturnType<typeof createSavePayload>;

export function exerciseSavePayloadTypes(raw: unknown): SavePayload {
  const payload = createSavePayload();
  applySavePayload(raw);
  applySavePayload(payload);
  return payload;
}
