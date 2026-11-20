export const TEMP_MIN = 16;
export const TEMP_MAX = 24;

const DEG = Math.PI / 180;

export const THERMOSTAT_ACTS = [
  {
    id: 'act-1',
    num: 1,
    shortTitle: { zh: '1. 双金属形变', en: '1. Bimetal Bend' },
    title: { zh: '第 1 幕 · 铜钢为什么会热弯？', en: 'Act 1 · Differential Thermal Expansion' },
    cue: {
      zh: '铜的热膨胀大于钢。降温时向上拱起压合触点加热，升温时向下弯断电。',
      en: 'Copper expands faster than steel: cooling bends up to close contact; heating bends down.',
    },
    carries: { zh: '起点：纯靠金属片热胀弯折控制开关。', en: 'Start: Temperature bends strip to flip relay.' },
    hook: { zh: '钩子：为何同样是 20 °C，加热器时而开、时而关？', en: 'Hook: Why can 20 °C be both ON and OFF depending on direction?' },
    relates: [{ to: 'act-2', type: 'deepens', why: { zh: '永磁吸合记忆历史', en: 'Magnetic snap remembers history' } }],
    initialTemp: 20,
    initialHeating: false,
    band: 4,
    sequence: [19, 18, 17, 19, 21, 22, 23],
    showNoise: false,
    camera: { target: [0.1, 0.72, 0.0], azimuth: 34 * DEG, elevation: 32 * DEG, zoom: 1.12 },
  },
  {
    id: 'act-2',
    num: 2,
    shortTitle: { zh: '2. 磁吸死区', en: '2. Hysteresis Loop' },
    title: { zh: '第 2 幕 · 同在 20 °C，历史决定状态', en: 'Act 2 · Memory Loop at 20 °C' },
    cue: {
      zh: '永磁铁在 18–22 °C 间锁住触点：先降到 18 再回 20 与先升到 22 再回 20 结果相反。',
      en: 'Magnet holds state across 18–22 °C deadband: returning to 20 °C traces two paths.',
    },
    carries: { zh: '承上：验证 18→20 °C 与 22→20 °C 两路回到同一温度的反差。', en: 'Carries: Tests 18→20 °C vs 22→20 °C paths at 20 °C.' },
    hook: { zh: '钩子：如果去掉这层 4 °C 回差（仅剩单点 20 °C），遇到室温微抖会怎样？', en: 'Hook: What breaks when band shrinks to 0 °C under real noise?' },
    relates: [{ to: 'act-3', type: 'contrast', why: { zh: '无回差高频抖动反例', en: 'Zero-band chatter failure' } }],
    initialTemp: 20,
    initialHeating: false,
    band: 4,
    sequence: [18, 19, 20, 21, 22, 21, 20],
    showNoise: false,
    camera: { target: [0.0, 0.76, 0.0], azimuth: 28 * DEG, elevation: 28 * DEG, zoom: 1.24 },
    prediction: {
      prompt: { zh: '走 20→18→20 与 20→22→20，两次回到 20 °C 时加热器？', en: 'After 20→18→20 vs 20→22→20, heater at 20 °C?' },
      choices: [
        { id: 'same', label: { zh: '状态相同（只看当前 20 °C）', en: 'Identical (depends only on T=20)' }, correct: false },
        { id: 'memory', label: { zh: '前者保持开，后者保持关', en: 'First stays ON; second stays OFF' }, correct: true },
      ],
      verdictOk: { zh: '准确！18 °C 吸合后保持开到 22 °C，相图完整画出滞回环。', en: 'Exact! Magnet holds state across 18–22 °C.' },
      verdictBad: { zh: '看左下滞回环：两趟回到 20 °C 走在上下两条不同轨道！', en: 'Watch the loop plot: upper ON branch vs lower OFF branch at 20 °C!' },
    },
  },
  {
    id: 'act-3',
    num: 3,
    shortTitle: { zh: '3. 去回差防抖', en: '3. Noise Chatter' },
    title: { zh: '第 3 幕 · 真实微抖下的抗抖动验证', en: 'Act 3 · Chatter Test Under Micro-Noise' },
    cue: {
      zh: '当室温在 20 °C 上下微抖：有 4° 回差仅触发 0 次；切换「0° 无回差」立刻触发连续火花！',
      en: 'Under ±0.5 °C noise around 20 °C: 4 °C band triggers 0 flips; 0 °C chatters rapidly!',
    },
    carries: { zh: '承上：用室温高频微抖对比 4 °C 死区与 0 °C 单门限。', en: 'Carries: Micro-oscillation tests hysteresis stability.' },
    hook: { zh: '推论：从温控器到施密特触发器、RL 防抖动奖励塑形都同构于此。', en: 'Beyond: Same threshold stability powers Schmitt triggers & control systems.' },
    relates: [{ to: 'act-2', type: 'uses', why: { zh: '回看相图矩形面积', en: 'Deadband area = noise margin' } }],
    initialTemp: 20,
    initialHeating: false,
    band: 0,
    sequence: [19.5, 20.5, 19.5, 20.5, 19.5, 20.5, 20],
    showNoise: true,
    camera: { target: [0.1, 0.72, 0.0], azimuth: 34 * DEG, elevation: 32 * DEG, zoom: 1.12 },
  },
];

export class ThermostatSimulation {
  constructor() {
    this.actIndex = 0;
    this.temperature = 20;
    this.heating = false;
    this.band = 4;
    this.switchCount = 0;
    this.trace = [{ x: 20, y: 0 }];
    this.lastFlip = null;
  }

  get act() {
    return THERMOSTAT_ACTS[this.actIndex] || THERMOSTAT_ACTS[0];
  }

  get thresholds() {
    return this.band > 0 ? [18, 22] : [20, 20];
  }

  loadAct(indexOrId) {
    const idx =
      typeof indexOrId === 'number'
        ? Math.max(0, Math.min(THERMOSTAT_ACTS.length - 1, indexOrId))
        : Math.max(0, THERMOSTAT_ACTS.findIndex((a) => a.id === indexOrId));
    this.actIndex = idx;
    this.band = this.act.band;
    this.resetState();
  }

  resetState() {
    this.temperature = this.act.initialTemp;
    this.heating = this.act.initialHeating;
    this.switchCount = 0;
    this.lastFlip = null;
    this.trace = [{ x: this.temperature, y: this.heating ? 1 : 0 }];
  }

  setBand(band) {
    this.band = band === 0 ? 0 : 4;
    this.resetState();
  }

  setTemperature(nextRaw) {
    const next = Math.max(TEMP_MIN, Math.min(TEMP_MAX, Math.round(nextRaw * 2) / 2));
    const prevHeating = this.heating;
    const prevTemp = this.temperature;
    this.temperature = next;

    if (this.band === 0) {
      this.heating = next <= 20;
    } else {
      if (next <= 18) this.heating = true;
      else if (next >= 22) this.heating = false;
    }

    const flipped = this.heating !== prevHeating;
    if (flipped) {
      this.switchCount += 1;
      this.lastFlip = this.heating ? 'on' : 'off';
    } else {
      this.lastFlip = null;
    }

    if (flipped && prevTemp !== next) {
      this.trace.push({ x: next, y: prevHeating ? 1 : 0 });
    }
    this.trace.push({ x: next, y: this.heating ? 1 : 0 });
    if (this.trace.length > 48) {
      this.trace.splice(0, this.trace.length - 48);
    }

    return {
      prevTemp,
      temperature: this.temperature,
      heating: this.heating,
      flipped,
      lastFlip: this.lastFlip,
      switchCount: this.switchCount,
    };
  }
}
