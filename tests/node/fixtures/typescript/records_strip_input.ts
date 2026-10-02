import {
  createRecordsStripViewModel,
  type RecordsStripViewModel,
} from "../../../../src/ui/records_strip.js";

export function exerciseRecordsStripInput(records: unknown): RecordsStripViewModel {
  const viewModel = createRecordsStripViewModel(records);
  const firstValue: string = viewModel.records[0].value;
  // @ts-expect-error projected record values are display strings.
  const invalidValue: number = viewModel.records[0].value;
  void [firstValue, invalidValue];
  return viewModel;
}
