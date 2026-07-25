const BASE_EXP_LEVELS = [
  0, 0, 200, 800, 2000, 4500, 9000, 16000, 25000, 40000, 60000,
  90000, 135000, 202500, 303750, 455625, 683438, 1025156, 1537734, 2306602, 3459902
];

// #275: 深層に到達させるためのEXP緩和。実src経路のsim(N=500, B20撤退)で
// 平均到達 8.67→10.26、平均Lv 3.68→4.84、bank素材EV 77.55→94.34。
// 注: sim内オーバーライドでの試算値(10.98/5.00)は乱数消費順が実srcと異なるため一致しない。
const EXP_CURVE_SCALE = 0.5;

export const EXP_LEVELS = BASE_EXP_LEVELS.map((exp, level) => (
  level < 2 ? exp : Math.round(exp * EXP_CURVE_SCALE)
));
