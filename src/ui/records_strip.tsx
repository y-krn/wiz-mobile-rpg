import * as React from "react";
import { isNormalizedRecords, type NormalizedRecordsBase } from "../state/records_state.js";

export interface RecordsStripViewModel {
  readonly records: readonly {
    readonly key: "retreat" | "death" | "runs";
    readonly label: string;
    readonly value: string;
  }[];
}

const EMPTY_RECORDS: NormalizedRecordsBase = {
  deepestRetreat: 0,
  deepestDeath: 0,
  totalRuns: 0,
};

function floorText(value: number): string {
  return value > 0 ? `B${value}F` : "未記録";
}

export function createRecordsStripViewModel(records: unknown): RecordsStripViewModel {
  const normalized = isNormalizedRecords(records) ? records : EMPTY_RECORDS;
  return {
    records: [
      { key: "retreat", label: "帰還最深", value: floorText(normalized.deepestRetreat) },
      { key: "death", label: "死亡最深", value: floorText(normalized.deepestDeath) },
      { key: "runs", label: "総潜行", value: String(normalized.totalRuns) },
    ],
  };
}

export function RecordsStrip({ viewModel }: { readonly viewModel: RecordsStripViewModel }): React.ReactElement {
  return (
    <>
      {viewModel.records.map(({ key, label, value }) => (
        <span key={key}>
          <small>{label}</small>
          <strong>{value}</strong>
        </span>
      ))}
    </>
  );
}
