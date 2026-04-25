import styles from '../press.module.css';

const CAMEL_PATH =
  'M0 28 L4 18 L8 14 L8 8 Q12 2 18 4 L20 8 L18 14 L24 16 L34 12 L38 18 L42 18 L42 22 L46 28 L42 32 L42 38 L40 38 L38 32 L20 32 L18 38 L16 38 L14 32 L4 32 Z';

const CAMEL_TRANSFORMS = [
  'translate(120 30)',
  'translate(420 32)',
  'translate(820 28)',
  'translate(1320 30)',
  'translate(1620 32)',
  'translate(2020 28)',
];

const HOOFPRINTS = [60, 200, 320, 540, 700, 940, 1080, 1240, 1450, 1740, 1880, 2160];

export function Caravan() {
  return (
    <div className={styles.caravan}>
      <span className={styles.caravanTick}>— in transit · 砂漠を進む隊商 —</span>
      <svg viewBox="0 0 2400 80" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M0,60 Q200,52 400,58 T800,54 T1200,60 T1600,52 T2000,58 T2400,56 L2400,80 L0,80 Z"
          fill="none"
          stroke="#15110A"
          strokeWidth="1"
        />
        <path
          d="M0,68 Q300,62 600,66 T1200,64 T1800,68 T2400,64"
          fill="none"
          stroke="#8A7C66"
          strokeWidth="0.8"
          strokeDasharray="3 5"
        />
        <g fill="#15110A">
          {CAMEL_TRANSFORMS.map((transform) => (
            <g key={transform} transform={transform}>
              <path d={CAMEL_PATH} />
            </g>
          ))}
        </g>
        <g fill="#8A7C66">
          {HOOFPRINTS.map((cx) => (
            <circle key={cx} cx={cx} cy="74" r="1.4" />
          ))}
        </g>
        <circle cx="220" cy="20" r="6" fill="#B8341E" />
        <circle cx="1420" cy="22" r="6" fill="#B8341E" />
      </svg>
    </div>
  );
}
