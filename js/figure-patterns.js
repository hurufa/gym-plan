// figure-patterns.js
// Pose generators for the exercise figure, one per movement pattern (with variants chosen from the
// exercise's patternParams). specFor(exercise) returns:
//   view      'side' (figure faces right) or 'front'
//   frame(p)  controls for movement phase p: 0 = start/top (concentric end), 1 = end of the 2 s
//             lowering phase. Controls: hip, torso angle (deg, 0 = upright, + leans toward +x),
//             leg targets (ankle + toe angle), arm targets (hand), bend signs for IK, props.
//   fixed     joints that must not move (contact points): 'ankleN', 'handF', 'hip', ... or
//             { joint, axis: 'y' } for a contact that slides along the floor
//   grips     [hand, prop] pairs: the hand must stay on that implement
//   kneeToe   legs whose knee must stay on the toe side of the hip-ankle line (knees over toes)
//   elbowSign anatomical bending side per arm (sign of the upper-arm x forearm cross product)
//   hold      isometric: the pose does not change
//   cycle     cardio: p runs a continuous gait cycle instead of the 2/1/0.5 s tempo
//   draw(c)   equipment shapes for the controls' props
// Units are SVG user units in a 320 x 260 viewBox; the floor is at y = 240.

export const SEG = { torso: 58, neck: 9, head: 11, upper: 32, fore: 30, thigh: 48, shin: 46, foot: 18, shoulderHalf: 17, hipHalf: 10 };
export const GROUND = 240;
const ANK = 232;                       // ankle height of a foot standing on the floor
const R = d => (d * Math.PI) / 180;
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const polar = (o, deg, len) => [o[0] + len * Math.cos(R(deg)), o[1] + len * Math.sin(R(deg))];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const shoulderOf = (hip, t) => [hip[0] + SEG.torso * Math.sin(R(t)), hip[1] - SEG.torso * Math.cos(R(t))];
// Point along the torso at fraction f from hip to shoulder, offset o toward the chest side.
export const onTorso = (hip, t, f, o = 0) => {
  const s = Math.sin(R(t)), c = Math.cos(R(t));
  return [hip[0] + SEG.torso * f * s + o * c, hip[1] - SEG.torso * f * c + o * s];
};
// Hip and torso angle when the shoulder is known (torso is rigid).
const hipFromShoulder = (sh, t) => [sh[0] - SEG.torso * Math.sin(R(t)), sh[1] + SEG.torso * Math.cos(R(t))];
// Torso angle for a hip and shoulder pair (their distance must equal SEG.torso).
const torsoAngle = (hip, sh) => (Math.atan2(sh[0] - hip[0], -(sh[1] - hip[1])) * 180) / Math.PI;
// A straight body (legs and torso in one line) leaning at angle phi from the ankle.
const straightBody = (ankle, phi, leg = 93.6) => {
  const hip = [ankle[0] + leg * Math.sin(R(phi)), ankle[1] - leg * Math.cos(R(phi))];
  return { hip, torso: phi };
};

// Shapes. Layers: 'back' is drawn behind the figure, 'front' over it.
const line = (a, b, cls = 'eq-line', layer = 'back') => ({ t: 'line', a, b, cls, layer });
const rect = (x, y, w, h, cls = 'eq-soft', layer = 'back', rot = 0) => ({ t: 'rect', x, y, w, h, cls, layer, rot });
const circ = (c, r, cls = 'eq-solid', layer = 'front') => ({ t: 'circle', c, r, cls, layer });
const plate = c => [circ(c, 15, 'eq-plate'), circ(c, 4, 'eq-hub')];
const smallPlate = c => [circ(c, 10, 'eq-plate'), circ(c, 3, 'eq-hub')];
const dumbbell = c => [rect(c[0] - 10, c[1] - 5, 20, 10, 'eq-solid', 'front')];
const dumbbellUpright = c => [rect(c[0] - 5, c[1] - 10, 10, 20, 'eq-solid', 'front')];
const cable = (a, b) => line(a, b, 'eq-cable');
const band = (a, b) => line(a, b, 'eq-band', 'front');
const floor = () => line([0, GROUND], [320, GROUND], 'floor');
const benchFlat = (x, y, w) => [rect(x, y, w, 8, 'eq-soft'), rect(x + 6, y + 8, 6, GROUND - y - 8, 'eq-solid'), rect(x + w - 12, y + 8, 6, GROUND - y - 8, 'eq-solid')];
const pulley = c => circ(c, 5, 'eq-hub', 'back');

const legsStanding = (toe = 0) => ({ n: { ankle: [150, ANK], toe }, f: { ankle: [150, ANK], toe } });
const STAND_HIP = [148, 140];
const FEET = ['ankleN', 'ankleF', 'toeN', 'toeF'];
const KNEES = ['n', 'f'];
const ELBOWS_DEFAULT = { n: -1, f: -1 };

// ---------------------------------------------------------------------------------------------
// Pattern variants
// ---------------------------------------------------------------------------------------------

const squatStanding = implement => {
  const lean = implement === 'barbell' ? 40 : implement === 'dumbbell' ? 24 : 34;
  return {
    view: 'side', fixed: FEET, kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT,
    grips: implement === 'barbell' ? [['handN', 'bar'], ['handF', 'bar']] : implement === 'dumbbell' ? [['handN', 'db'], ['handF', 'db']] : [],
    frame(p) {
      const hip = lerpP(STAND_HIP, [114, 194], p), torso = lerp(0, lean, p);
      const sh = shoulderOf(hip, torso);
      const props = {};
      let hand;
      if (implement === 'barbell') hand = props.bar = onTorso(hip, torso, 0.98, -19);
      else if (implement === 'dumbbell') hand = props.db = onTorso(hip, torso, 0.72, 20);
      else hand = [sh[0] + 57, sh[1] + 8];
      return { hip, torso, legs: legsStanding(), arms: { n: { hand }, f: { hand } }, props };
    },
    draw: c => [floor(), ...(c.props.bar ? plate(c.props.bar) : []), ...(c.props.db ? dumbbellUpright(c.props.db) : [])],
  };
};

const legPress = {
  view: 'side', fixed: ['hip', 'shoulder', 'handN', 'handF'], kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const hip = [118, 178], torso = -50;
    const ankle = polar(hip, -30, lerp(86, 48, p));
    return { hip, torso, legs: { n: { ankle, toe: -120 }, f: { ankle, toe: -120 } }, arms: { n: { hand: [116, 180] }, f: { hand: [116, 180] } }, bend: { an: 1 }, props: { sled: ankle } };
  },
  draw: c => {
    const sh = shoulderOf(c.hip, c.torso);
    const back = [polar(c.hip, 130, 12), polar(sh, 130, 30)];
    const pl = add(c.props.sled, [-4, 6]);
    return [floor(), line(back[0], back[1], 'eq-pad'), line([96, 192], [140, 192], 'eq-pad'), line([150, 220], polar([150, 220], -30, 140), 'eq-line'),
      { t: 'rect', x: pl[0] - 4, y: pl[1] - 22, w: 8, h: 44, cls: 'eq-solid', layer: 'back', rot: -30 }];
  },
};

const wallSit = {
  view: 'side', fixed: ['ankleN', 'ankleF', 'hip', 'shoulder'], kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [], hold: true,
  frame() {
    return { hip: [106, 186], torso: 0, legs: { n: { ankle: [154, ANK], toe: 0 }, f: { ankle: [154, ANK], toe: 0 } }, arms: { n: { hand: [136, 180] }, f: { hand: [136, 180] } }, props: {} };
  },
  draw: () => [floor(), rect(80, 20, 12, GROUND - 20, 'eq-solid')],
};

const hingeStanding = implement => ({
  view: 'side', fixed: FEET, kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [['handN', 'bar'], ['handF', 'bar']],
  frame(p) {
    const hip = lerpP(STAND_HIP, [116, 152], p), torso = lerp(0, 72, p);
    const sh = shoulderOf(hip, torso);
    // The bar hangs from the shoulders (arms long) and drifts back toward the shins.
    const bar = [lerp(151, 160, p), sh[1] + 57.5];
    return { hip, torso, legs: legsStanding(), arms: { n: { hand: bar }, f: { hand: bar } }, props: { bar } };
  },
  draw: c => [floor(), ...(implement === 'barbell' ? plate(c.props.bar) : dumbbell(c.props.bar))],
});

const hingeSingleLeg = {
  view: 'side', fixed: ['ankleN', 'toeN'], kneeToe: ['n'], elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const hip = lerpP(STAND_HIP, [122, 150], p), torso = lerp(0, 80, p);
    const sh = shoulderOf(hip, torso);
    const back = [-Math.sin(R(torso)), Math.cos(R(torso))];
    const farAnkle = [hip[0] + 86 * back[0], hip[1] + 86 * back[1]];
    const hand = add(sh, [2, 56]);
    return { hip, torso, legs: { n: { ankle: [150, ANK], toe: 0 }, f: { ankle: farAnkle, toe: lerp(10, 90, p) } }, arms: { n: { hand }, f: { hand } }, props: {} };
  },
  draw: () => [floor()],
};

const lunge = (implement, prop) => {
  const rear = prop === 'floor' ? { ankle: [96, 226], toe: 30 } : { ankle: [86, 190], toe: 160 };
  return {
    view: 'side', fixed: FEET, kneeToe: ['n'], elbowSign: ELBOWS_DEFAULT, grips: [],
    frame(p) {
      const hip = lerpP([138, 150], [134, 194], p), torso = lerp(6, prop === 'floor' ? 10 : 14, p);
      const sh = shoulderOf(hip, torso);
      const hand = implement === 'dumbbell' ? add(sh, [4, 57]) : add(hip, [8, -4]);
      return { hip, torso, legs: { n: { ankle: [178, ANK], toe: 0 }, f: rear }, arms: { n: { hand }, f: { hand } }, props: { db: implement === 'dumbbell' ? hand : null } };
    },
    draw: c => [floor(), ...(prop !== 'floor' ? benchFlat(40, 196, 56) : []), ...(c.props.db ? dumbbell(c.props.db) : [])],
  };
};

const calfRaise = position => ({
  view: 'side', fixed: position === 'single-leg' ? ['toeN'] : ['toeN', 'toeF'], kneeToe: position === 'single-leg' ? ['n'] : KNEES, elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const toe = [170, 214];
    const th = lerp(35, -20, p);
    const ankle = [toe[0] - SEG.foot * Math.cos(R(th)), toe[1] - SEG.foot * Math.sin(R(th))];
    const hip = add(ankle, [-2, -91]);
    const sh = shoulderOf(hip, 0);
    const far = position === 'single-leg' ? { ankle: add(hip, [-34, 64]), toe: 70 } : { ankle, toe: th };
    const hand = position === 'single-leg' ? add(sh, [44, 30]) : add(sh, [20, 14]);
    return { hip, torso: 0, legs: { n: { ankle, toe: th }, f: far }, arms: { n: { hand }, f: { hand } }, props: { sh } };
  },
  draw: c => [floor(), rect(150, 214, 60, GROUND - 214, 'eq-soft'), ...(position === 'single-leg' ? [rect(232, 20, 12, GROUND - 20, 'eq-solid')] : [rect(c.props.sh[0] - 6, c.props.sh[1] - 20, 30, 8, 'eq-solid', 'front')])],
});

// Horizontal push -----------------------------------------------------------------------------
const benchPress = implement => ({
  view: 'side', fixed: ['hip', 'shoulder', 'ankleN', 'ankleF'], kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [['handN', 'bar'], ['handF', 'bar']],
  frame(p) {
    const bar = lerpP([122, 120], [136, 166], p);
    return { hip: [176, 180], torso: -90, legs: { n: { ankle: [214, ANK], toe: 0 }, f: { ankle: [214, ANK], toe: 0 } }, arms: { n: { hand: bar }, f: { hand: bar } }, props: { bar } };
  },
  draw: c => [floor(), ...benchFlat(92, 192, 104), ...(implement === 'barbell' ? plate(c.props.bar) : dumbbell(c.props.bar))],
});

const inclinePress = {
  view: 'side', fixed: ['hip', 'shoulder', 'ankleN', 'ankleF'], kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [['handN', 'bar'], ['handF', 'bar']],
  frame(p) {
    const bar = lerpP([138, 108], [148, 155], p);
    return { hip: [176, 196], torso: -60, legs: { n: { ankle: [212, ANK], toe: 0 }, f: { ankle: [212, ANK], toe: 0 } }, arms: { n: { hand: bar }, f: { hand: bar } }, props: { bar } };
  },
  draw: c => [floor(), { t: 'rect', x: 105, y: 191, w: 76, h: 8, cls: 'eq-soft', layer: 'back', rot: 30 }, rect(160, 206, 40, 8, 'eq-soft'), rect(176, 214, 6, GROUND - 214, 'eq-solid'), ...dumbbell(c.props.bar)],
};

// Push-up family: body pivots on the toes; hands fixed.
const pushUp = (position, prop) => {
  const set = position === 'incline'
    ? { ankle: [70, 226], hands: [196, 176], phi: [44.5, 58] }
    : position === 'decline'
      ? { ankle: [22, 182], hands: [160, ANK + 4], phi: [92, 104] }
      : { ankle: [14, 224], hands: [152, ANK + 4], phi: [72, 88] };
  return {
    view: 'side', fixed: ['ankleN', 'ankleF', 'handN', 'handF'], kneeToe: [], elbowSign: { n: 1, f: 1 }, grips: [],
    frame(p) {
      const { hip, torso } = straightBody(set.ankle, lerp(set.phi[0], set.phi[1], p));
      return { hip, torso, legs: { n: { ankle: set.ankle, toe: 60 }, f: { ankle: set.ankle, toe: 60 } }, arms: { n: { hand: set.hands }, f: { hand: set.hands } }, bend: { an: -1, af: -1 }, props: {} };
    },
    draw: () => [floor(), ...(prop === 'counter' ? [rect(190, 176, 70, GROUND - 176, 'eq-soft')] : []), ...(position === 'decline' ? [rect(0, 196, 44, GROUND - 196, 'eq-soft')] : [])],
  };
};

// Vertical push ---------------------------------------------------------------------------------
const ohpStanding = {
  view: 'side', fixed: FEET, kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [['handN', 'bar'], ['handF', 'bar']],
  frame(p) {
    const bar = lerpP([150, 24], [168, 74], p);
    return { hip: STAND_HIP, torso: 0, legs: legsStanding(), arms: { n: { hand: bar }, f: { hand: bar } }, bend: { an: 1, af: 1 }, props: { bar } };
  },
  draw: c => [floor(), ...plate(c.props.bar)],
};

const seatedPress = {
  view: 'side', fixed: ['hip', 'shoulder', 'ankleN', 'ankleF'], kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [['handN', 'bar'], ['handF', 'bar']],
  frame(p) {
    const bar = lerpP([134, 74], [142, 114], p);
    return { hip: [130, 190], torso: 0, legs: { n: { ankle: [180, ANK], toe: 0 }, f: { ankle: [180, ANK], toe: 0 } }, arms: { n: { hand: bar }, f: { hand: bar } }, bend: { an: 1, af: 1 }, props: { bar } };
  },
  draw: c => [floor(), rect(100, 198, 60, 8, 'eq-soft'), rect(104, 110, 8, 88, 'eq-soft'), rect(124, 206, 6, GROUND - 206, 'eq-solid'), ...dumbbell(c.props.bar)],
};

const pikePushUp = {
  view: 'side', fixed: ['ankleN', 'ankleF', 'handN', 'handF'], kneeToe: [], elbowSign: { n: 1, f: 1 }, grips: [],
  frame(p) {
    const hip = lerpP([118, 146], [138.7, 169.6], p), torso = lerp(126, 140, p);
    return { hip, torso, legs: { n: { ankle: [70, 226], toe: 60 }, f: { ankle: [70, 226], toe: 60 } }, arms: { n: { hand: [170, ANK + 4] }, f: { hand: [170, ANK + 4] } }, bend: { an: -1, af: -1 }, props: {} };
  },
  draw: () => [floor()],
};

// Horizontal pull -------------------------------------------------------------------------------
const rowSeated = implement => ({
  view: 'side', fixed: ['hip', 'ankleN', 'ankleF'], kneeToe: [], elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const hand = lerpP([138, 156], [174, 148], p);
    return { hip: [118, 196], torso: lerp(-4, 10, p), legs: { n: { ankle: [200, 188], toe: -80 }, f: { ankle: [200, 188], toe: -80 } }, arms: { n: { hand }, f: { hand } }, props: { hand } };
  },
  draw: c => [floor(), rect(96, 204, 48, 8, 'eq-soft'), rect(206, 150, 8, 90, 'eq-soft'),
    ...(implement === 'cable' ? [pulley([300, 150]), cable(c.props.hand, [300, 150])] : [band(c.props.hand, [204, 190])])],
});

const rowBentOver = {
  view: 'side', fixed: FEET, kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [['handN', 'bar'], ['handF', 'bar']],
  frame(p) {
    const bar = lerpP([150, 142], [170, 170], p);
    return { hip: [128, 150], torso: 50, legs: legsStanding(), arms: { n: { hand: bar }, f: { hand: bar } }, props: { bar } };
  },
  draw: c => [floor(), ...plate(c.props.bar)],
};

const rowOneArm = {
  view: 'side', fixed: ['ankleN', 'ankleF', 'handF', 'hip'], kneeToe: ['n'], elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const hand = lerpP([140, 152], [170, 200], p);
    return { hip: [112, 152], torso: 82, legs: { n: { ankle: [132, ANK], toe: 0 }, f: { ankle: [72, 180], toe: 180 } }, arms: { n: { hand }, f: { hand: [176, 184] } }, bend: { lf: -1, af: 1 }, props: { db: hand } };
  },
  draw: c => [floor(), ...benchFlat(64, 188, 128), ...dumbbell(c.props.db)],
};

const doorwayRow = {
  view: 'side', fixed: ['ankleN', 'ankleF', 'handN', 'handF'], kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const ankle = [196, 226];
    const { hip, torso } = straightBody(ankle, lerp(-3, -14, p));
    return { hip, torso, legs: { n: { ankle, toe: 30 }, f: { ankle, toe: 30 } }, arms: { n: { hand: [210, 104] }, f: { hand: [210, 104] } }, props: {} };
  },
  draw: () => [floor(), rect(214, 10, 12, GROUND - 10, 'eq-solid')],
};

// Vertical pull -----------------------------------------------------------------------------------
const pullUp = {
  view: 'side', fixed: ['handN', 'handF'], kneeToe: KNEES, elbowSign: { n: 1, f: 1 }, grips: [['handN', 'bar'], ['handF', 'bar']],
  frame(p) {
    const bar = [160, 20];
    const sh = lerpP([152, 42], [157, 80], p), torso = 4;
    const hip = hipFromShoulder(sh, torso);
    return { hip, torso, legs: { n: { ankle: add(hip, [-8, 84]), toe: 60 }, f: { ankle: add(hip, [-8, 84]), toe: 60 } }, arms: { n: { hand: bar }, f: { hand: bar } }, bend: { an: -1, af: -1 }, props: { bar } };
  },
  draw: c => [circ(c.props.bar, 4, 'eq-hub', 'back'), line([160, 20], [260, 20], 'eq-line'), line([260, 20], [260, GROUND], 'eq-line'), floor()],
};

const latPulldown = implement => ({
  view: 'side', fixed: implement === 'band' ? ['hip', 'ankleN', 'ankleF'] : ['hip', 'ankleN', 'ankleF'], kneeToe: implement === 'band' ? [] : KNEES, elbowSign: { n: 1, f: 1 }, grips: [],
  frame(p) {
    if (implement === 'band') {
      const hand = lerpP([150, 118], [138, 70], p);
      return { hip: [132, 184], torso: 0, legs: { n: { ankle: [86, ANK], toe: 180 }, f: { ankle: [86, ANK], toe: 180 } }, arms: { n: { hand }, f: { hand } }, bend: { an: -1, af: -1 }, props: { hand } };
    }
    const hand = lerpP([150, 124], [136, 74], p);
    return { hip: [130, 190], torso: -5, legs: { n: { ankle: [176, ANK], toe: 0 }, f: { ankle: [176, ANK], toe: 0 } }, arms: { n: { hand }, f: { hand } }, bend: { an: -1, af: -1 }, props: { hand } };
  },
  draw: c => implement === 'band'
    ? [floor(), rect(150, 0, 10, 10, 'eq-solid'), band(c.props.hand, [155, 10])]
    : [floor(), rect(104, 198, 56, 8, 'eq-soft'), rect(150, 168, 30, 8, 'eq-soft'), pulley([138, 6]), cable(c.props.hand, [138, 6])],
});

// Arms ------------------------------------------------------------------------------------------------
const curlStanding = implement => ({
  view: 'side', fixed: FEET, kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const sh = shoulderOf(STAND_HIP, 0);
    const elbow = add(sh, [2, 31.9]);
    const hand = polar(elbow, lerp(-50, 92, p), SEG.fore);
    return { hip: STAND_HIP, torso: 0, legs: legsStanding(), arms: { n: { hand }, f: { hand } }, bend: { an: 1, af: 1 }, props: { hand } };
  },
  draw: c => [floor(), ...(implement === 'barbell' ? smallPlate(c.props.hand) : implement === 'dumbbell' ? dumbbell(c.props.hand) : [band(c.props.hand, [152, ANK])])],
});

const doorframeCurl = {
  ...doorwayRow,
  frame(p) {
    const ankle = [196, 226];
    const { hip, torso } = straightBody(ankle, lerp(-8, -17, p));
    const sh = shoulderOf(hip, torso);
    return { hip, torso, legs: { n: { ankle, toe: 30 }, f: { ankle, toe: 30 } }, arms: { n: { hand: [210, 100] }, f: { hand: add(sh, [2, 58]) } }, bend: { an: 1 }, props: {} };
  },
  fixed: ['ankleN', 'ankleF', 'handN'],
  elbowSign: { n: -1, f: -1 },
};

const pushdown = {
  view: 'side', fixed: FEET, kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const sh = shoulderOf(STAND_HIP, 4);
    const elbow = add(sh, [6, 31.4]);
    const hand = polar(elbow, lerp(92, -18, p), SEG.fore);
    return { hip: STAND_HIP, torso: 4, legs: legsStanding(), arms: { n: { hand }, f: { hand } }, bend: { an: 1, af: 1 }, props: { hand } };
  },
  draw: c => [floor(), pulley([210, 6]), cable(c.props.hand, [210, 6])],
};

const overheadExtension = {
  view: 'side', fixed: ['hip', 'shoulder', 'ankleN', 'ankleF'], kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const hip = [130, 190], sh = shoulderOf(hip, 0);
    const elbow = add(sh, [3.3, -31.8]);
    const hand = polar(elbow, lerp(-84, -219, p), SEG.fore);
    return { hip, torso: 0, legs: { n: { ankle: [180, ANK], toe: 0 }, f: { ankle: [180, ANK], toe: 0 } }, arms: { n: { hand }, f: { hand } }, bend: { an: 1, af: 1 }, props: { hand } };
  },
  draw: c => [floor(), rect(100, 198, 60, 8, 'eq-soft'), rect(104, 110, 8, 88, 'eq-soft'), rect(124, 206, 6, GROUND - 206, 'eq-solid'), ...dumbbellUpright(c.props.hand)],
};

const counterExtension = {
  view: 'side', fixed: ['ankleN', 'ankleF', 'handN', 'handF'], kneeToe: [], elbowSign: { n: 1, f: 1 }, grips: [],
  frame(p) {
    const ankle = [90, 226];
    const { hip, torso } = straightBody(ankle, lerp(40, 52, p));
    return { hip, torso, legs: { n: { ankle, toe: 40 }, f: { ankle, toe: 40 } }, arms: { n: { hand: [200, 170] }, f: { hand: [200, 170] } }, bend: { an: -1, af: -1 }, props: {} };
  },
  draw: () => [floor(), rect(198, 176, 70, GROUND - 176, 'eq-soft')],
};

// Front view: shoulders and hips are split left/right.
const lateralRaise = implement => ({
  view: 'front', fixed: FEET, kneeToe: KNEES, elbowSign: { n: 1, f: -1 }, grips: [],
  frame(p) {
    const a = lerp(4, 84, p);
    const hip = [160, 138.2], sh = shoulderOf(hip, 0);
    const shR = add(sh, [SEG.shoulderHalf, 0]), shL = add(sh, [-SEG.shoulderHalf, 0]);
    return {
      hip, torso: 0,
      legs: { n: { ankle: [170, ANK], toe: 20 }, f: { ankle: [150, ANK], toe: 160 } },
      arms: { n: { hand: polar(shR, a, 58) }, f: { hand: polar(shL, 180 - a, 58) } },
      bend: { ln: -1, lf: 1, an: -1, af: 1 }, props: {},
    };
  },
  draw: c => [floor(), ...(implement === 'band'
    ? [band(c.arms.n.hand, [170, ANK]), band(c.arms.f.hand, [150, ANK])]
    : [...dumbbellUpright(c.arms.n.hand), ...dumbbellUpright(c.arms.f.hand)])],
});

const chestFly = {
  view: 'front', fixed: FEET, kneeToe: KNEES, elbowSign: { n: 1, f: -1 }, grips: [],
  frame(p) {
    const hip = [160, 138.2], sh = shoulderOf(hip, 0);
    const shR = add(sh, [SEG.shoulderHalf, 0]), shL = add(sh, [-SEG.shoulderHalf, 0]);
    const hR = lerpP([166, 114], add(shR, [56, 4]), p), hL = lerpP([154, 114], add(shL, [-56, 4]), p);
    return { hip, torso: 0, legs: { n: { ankle: [170, ANK], toe: 20 }, f: { ankle: [150, ANK], toe: 160 } }, arms: { n: { hand: hR }, f: { hand: hL } }, bend: { ln: -1, lf: 1, an: -1, af: 1 }, props: {} };
  },
  draw: c => [floor(), pulley([18, 86]), pulley([302, 86]), cable(c.arms.n.hand, [302, 86]), cable(c.arms.f.hand, [18, 86])],
};

// Legs (machines and floor) ------------------------------------------------------------------------
const legExtension = {
  view: 'side', fixed: ['hip', 'shoulder', 'kneeN', 'kneeF'], kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const hip = [120, 176], knee = add(hip, [48, 0]);
    const th = lerp(8, 92, p);
    const ankle = polar(knee, th, SEG.shin);
    return { hip, torso: 0, legs: { n: { ankle, toe: th - 90 }, f: { ankle, toe: th - 90 } }, arms: { n: { hand: [118, 176] }, f: { hand: [118, 176] } }, props: { ankle } };
  },
  draw: c => [floor(), rect(100, 186, 72, 8, 'eq-soft'), rect(98, 112, 8, 74, 'eq-soft'), rect(130, 194, 8, GROUND - 194, 'eq-solid'), circ(add(c.props.ankle, [3, -8]), 6, 'eq-pad-c')],
};

const legCurlMachine = {
  view: 'side', fixed: ['hip', 'shoulder', 'kneeN', 'kneeF'], kneeToe: [], elbowSign: { n: 1, f: 1 }, grips: [],
  frame(p) {
    const hip = [150, 172], knee = add(hip, [-48, 0]);
    const th = lerp(302, 178, p);
    const ankle = polar(knee, th, SEG.shin);
    return { hip, torso: 90, legs: { n: { ankle, toe: th + 90 }, f: { ankle, toe: th + 90 } }, arms: { n: { hand: [212, 196] }, f: { hand: [212, 196] } }, bend: { an: -1, af: -1 }, props: { ankle } };
  },
  draw: c => [floor(), rect(86, 182, 150, 8, 'eq-soft'), rect(110, 190, 8, GROUND - 190, 'eq-solid'), rect(206, 190, 8, GROUND - 190, 'eq-solid'), circ(add(c.props.ankle, [0, -8]), 6, 'eq-pad-c')],
};

const slidingLegCurl = {
  view: 'side', fixed: ['shoulder', 'handN', 'handF', { joint: 'ankleN', axis: 'y' }, { joint: 'ankleF', axis: 'y' }], kneeToe: [], elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const sh = [66, 227];
    const hip = polar(sh, lerp(-28, -14, p), SEG.torso);
    const ankle = [lerp(168, 210, p), ANK];
    return { hip, torso: torsoAngle(hip, sh), legs: { n: { ankle, toe: -80 }, f: { ankle, toe: -80 } }, arms: { n: { hand: [126, 233] }, f: { hand: [126, 233] } }, props: { ankle } };
  },
  draw: c => [floor(), rect(c.props.ankle[0] - 10, GROUND - 4, 24, 4, 'eq-solid')],
};

// Dip, trunk, core, hips ---------------------------------------------------------------------------
const dip = prop => {
  if (prop === 'bench') {
    return {
      view: 'side', fixed: ['handN', 'handF', 'ankleN', 'ankleF'], kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [],
      frame(p) {
        const sh = lerpP([108, 124], [112, 160], p);
        const hip = hipFromShoulder(sh, 0);
        return { hip, torso: 0, legs: { n: { ankle: [186, ANK], toe: -70 }, f: { ankle: [186, ANK], toe: -70 } }, arms: { n: { hand: [104, 182] }, f: { hand: [104, 182] } }, props: {} };
      },
      draw: () => [floor(), ...benchFlat(50, 182, 60)],
    };
  }
  return {
    view: 'side', fixed: ['handN', 'handF'], kneeToe: [], elbowSign: ELBOWS_DEFAULT, grips: [['handN', 'bar'], ['handF', 'bar']],
    frame(p) {
      const sh = lerpP([148, 70], [152, 104], p), torso = 12;
      const hip = hipFromShoulder(sh, torso);
      return { hip, torso, legs: { n: { ankle: add(hip, [-18, 86]), toe: 60 }, f: { ankle: add(hip, [-18, 86]), toe: 60 } }, arms: { n: { hand: [150, 128] }, f: { hand: [150, 128] } }, props: { bar: [150, 128] } };
    },
    draw: () => [rect(134, 128, 34, 6, 'eq-solid', 'front'), line([166, 134], [166, GROUND], 'eq-line'), floor()],
  };
};

const crunch = {
  view: 'side', fixed: ['hip', 'ankleN', 'ankleF'], kneeToe: KNEES, elbowSign: { n: 1, f: 1 }, grips: [],
  frame(p) {
    const hip = [150, 226], torso = lerp(-62, -90, p);
    const hand = onTorso(hip, torso, 1.34, -6);
    return { hip, torso, legs: { n: { ankle: [200, ANK], toe: 0 }, f: { ankle: [200, ANK], toe: 0 } }, arms: { n: { hand }, f: { hand } }, bend: { an: -1, af: -1 }, props: {} };
  },
  draw: () => [floor()],
};

const cableCrunch = {
  view: 'side', fixed: ['hip', 'ankleN', 'ankleF'], kneeToe: [], elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const hip = [132, 184], torso = lerp(72, 16, p);
    const hand = onTorso(hip, torso, 1.3, 12);
    return { hip, torso, legs: { n: { ankle: [86, ANK], toe: 180 }, f: { ankle: [86, ANK], toe: 180 } }, arms: { n: { hand }, f: { hand } }, props: { hand } };
  },
  draw: c => [floor(), pulley([150, 6]), cable(c.props.hand, [150, 6])],
};

const plank = position => ({
  view: 'side', fixed: position === 'side-plank' ? ['ankleN', 'ankleF', 'handF', 'hip', 'shoulder'] : ['ankleN', 'ankleF', 'handN', 'hip', 'shoulder'], kneeToe: [], elbowSign: { n: 1, f: 1 }, grips: [], hold: true,
  frame() {
    const ankle = [14, 224];
    const { hip, torso } = straightBody(ankle, position === 'side-plank' ? 80 : 83);
    const sh = shoulderOf(hip, torso);
    return { hip, torso, legs: { n: { ankle, toe: 60 }, f: { ankle, toe: 60 } },
      arms: position === 'side-plank'
        ? { n: { hand: add(hip, [6, -10]) }, f: { hand: [sh[0] + 31, ANK + 2] } }
        : { n: { hand: [sh[0] + 31, ANK + 2] }, f: { hand: [sh[0] + 31, ANK + 2] } },
      bend: { an: -1, af: -1 }, props: {} };
  },
  draw: () => [floor()],
});

const hipThrust = {
  view: 'side', fixed: ['shoulder', 'ankleN', 'ankleF'], kneeToe: KNEES, elbowSign: { n: 1, f: 1 }, grips: [['handN', 'bar'], ['handF', 'bar']],
  frame(p) {
    const sh = [70, 172];
    const hip = polar(sh, lerp(0, 48, p), SEG.torso);
    const bar = add(hip, [0, -14]);
    return { hip, torso: torsoAngle(hip, sh), legs: { n: { ankle: [172, ANK], toe: 0 }, f: { ankle: [172, ANK], toe: 0 } }, arms: { n: { hand: bar }, f: { hand: bar } }, bend: { an: -1, af: -1 }, props: { bar } };
  },
  draw: c => [floor(), ...benchFlat(20, 180, 56), ...plate(c.props.bar)],
};

const gluteBridge = single => ({
  view: 'side', fixed: single ? ['shoulder', 'ankleN', 'handN', 'handF'] : ['shoulder', 'ankleN', 'ankleF', 'handN', 'handF'], kneeToe: single ? ['n'] : KNEES, elbowSign: ELBOWS_DEFAULT, grips: [],
  frame(p) {
    const sh = [66, 227];
    const ang = lerp(-32, 0, p);
    const hip = polar(sh, ang, SEG.torso);
    const far = single ? { ankle: polar(hip, ang - 28, 90), toe: ang - 28 } : { ankle: [166, ANK], toe: 0 };
    return { hip, torso: torsoAngle(hip, sh), legs: { n: { ankle: [166, ANK], toe: 0 }, f: far }, arms: { n: { hand: [126, 233] }, f: { hand: [126, 233] } }, props: {} };
  },
  draw: () => [floor()],
});

// Cardio: continuous gait cycle.
const gait = kind => ({
  view: 'side', fixed: [], kneeToe: KNEES, elbowSign: ELBOWS_DEFAULT, grips: [], cycle: kind === 'jog' ? 0.8 : 1.1,
  frame(p) {
    const jog = kind === 'jog';
    const stride = jog ? 30 : 24, lift = jog ? 18 : 8;
    const ph = 2 * Math.PI * p;
    const foot = o => [150 + stride * Math.cos(ph + o), ANK - lift * Math.max(0, Math.sin(ph + o))];
    const hip = [148, (jog ? 149 : 142) + (jog ? 3 : 1.5) * Math.cos(2 * ph)], torso = jog ? 8 : 3;
    const sh = shoulderOf(hip, torso);
    const arm = o => (jog ? polar(sh, 90 + 34 * Math.cos(ph + o + Math.PI), 40) : polar(sh, 90 + 24 * Math.cos(ph + o + Math.PI), 58));
    return { hip, torso, legs: { n: { ankle: foot(0), toe: 0 }, f: { ankle: foot(Math.PI), toe: 0 } }, arms: { n: { hand: arm(0) }, f: { hand: arm(Math.PI) } }, bend: { an: 1, af: 1 }, props: {} };
  },
  draw: () => [floor()],
});

// ---------------------------------------------------------------------------------------------
// Exercise -> variant
// ---------------------------------------------------------------------------------------------
export function variantKey(ex) {
  const pp = ex.patternParams;
  return [ex.pattern, pp.position, pp.implement, pp.prop, pp.gait].filter(Boolean).join('/');
}

export function specFor(ex) {
  const { implement, position, prop, gait: g } = ex.patternParams;
  switch (ex.pattern) {
    case 'squat': return position === 'seated' ? legPress : ex.patternParams.tempo === 'isometric' ? wallSit : squatStanding(implement);
    case 'hinge': return position === 'single-leg' ? hingeSingleLeg : hingeStanding(implement);
    case 'lunge': return lunge(implement, prop || 'floor');
    case 'calf-raise': return calfRaise(position);
    case 'horizontal-push':
      if (position === 'lying') return benchPress(implement);
      if (position === 'incline' && implement === 'dumbbell') return inclinePress;
      return pushUp(position, prop);
    case 'vertical-push': return position === 'plank' ? pikePushUp : position === 'seated' ? seatedPress : ohpStanding;
    case 'horizontal-pull':
      if (position === 'seated') return rowSeated(implement);
      if (position === 'bent-over') return rowBentOver;
      if (position === 'supported') return rowOneArm;
      return doorwayRow;
    case 'vertical-pull': return position === 'hanging' ? pullUp : latPulldown(implement);
    case 'curl': return position === 'leaning' ? doorframeCurl : curlStanding(implement);
    case 'triceps-extension': return position === 'seated' ? overheadExtension : position === 'leaning' ? counterExtension : pushdown;
    case 'lateral-raise': return lateralRaise(implement);
    case 'chest-fly': return chestFly;
    case 'knee-extension': return legExtension;
    case 'knee-flexion': return implement === 'machine' ? legCurlMachine : slidingLegCurl;
    case 'dip': return dip(prop);
    case 'trunk-flexion': return position === 'kneeling' ? cableCrunch : crunch;
    case 'core-hold': return plank(position);
    case 'hip-thrust': return position === 'supported' ? hipThrust : gluteBridge(position === 'single-leg');
    case 'cardio': return gait(g);
    default: throw new Error(`No figure pattern for ${ex.pattern}`);
  }
}

// Which body segments carry the exercise's primary muscles (shown in the accent colour).
const SEGMENT_OF = {
  chest: 'torso', 'upper-chest': 'torso', lats: 'torso', 'upper-back': 'torso', traps: 'torso', 'spinal-erectors': 'torso',
  abs: 'torso', obliques: 'torso', core: 'torso', glutes: 'pelvis',
  'front-delts': 'upperArm', 'side-delts': 'upperArm', 'rear-delts': 'upperArm', biceps: 'upperArm', brachialis: 'upperArm', triceps: 'upperArm',
  forearms: 'foreArm', quads: 'thigh', hamstrings: 'thigh', adductors: 'thigh', calves: 'shin',
};
export const workingSegments = ex => new Set(ex.primary.map(m => SEGMENT_OF[m]).filter(Boolean));
