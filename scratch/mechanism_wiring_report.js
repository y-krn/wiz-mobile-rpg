// 機構（罠/工房/消耗品/帰還の翼/鑑定など）が、この測定で実際に発火した回数を出力する。
// 「実装がある」ではなく「この測定で発火した」を示すため、0件は警告として出す。
// 0が正しい場合（工房空の条件で購入0など）もあるため、停止はせず警告のみに留める。

export function reportMechanismFiring(counters, { label = "配線検査" } = {}) {
  Object.entries(counters).forEach(([name, count]) => {
    if (!Number.isFinite(count)) {
      console.log(`${label}: ${name} 発火回数=不明（数値でない値を渡された）`);
      return;
    }
    if (count === 0) {
      console.log(`${label}警告: ${name} 発火回数=0（0が正しい条件でなければ未配線を疑うこと）`);
    } else {
      console.log(`${label}: ${name} 発火回数=${count}`);
    }
  });
}
