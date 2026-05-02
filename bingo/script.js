'use strict';

import * as sharedStorage from '../shared/storage.js';

/* ============================================================
   DEFAULT PROBLEMS (80 integer addition/subtraction problems)
   Columns: B(-25 to -16), I(-15 to -6), N(-5 to 5), G(6-15), O(16-25)
   ============================================================ */
/* ============================================================
   PRE-BUILT BINGO SETS  (add set objects as { name, path } to fill in later)
   ============================================================ */
/* Topic catalog.
   Each TOPIC_GROUPS entry:
     { id, short, long, grades:{gradeKey:standard}, fluency?:{gradeKey:true},
       calc?:bool, variants:[{label, path?, recommended?, calc?}] }
   A topic is "playable" if any variant has `path`. A group can appear in
   multiple grades; the displayed standard changes per active grade filter. */
const GRADE_ORDER = ['K','1','2','3','4','5','6','7','8','Pre-Algebra','Algebra I','Geometry','Algebra II','Pre-Calculus','Calculus','Statistics'];
const GRADE_LABELS = {
  'K': 'Kindergarten', '1': 'Grade 1', '2': 'Grade 2', '3': 'Grade 3', '4': 'Grade 4',
  '5': 'Grade 5', '6': 'Grade 6', '7': 'Grade 7', '8': 'Grade 8',
  'Pre-Algebra': 'Pre-Algebra', 'Algebra I': 'Algebra I', 'Geometry': 'Geometry',
  'Algebra II': 'Algebra II', 'Pre-Calculus': 'Pre-Calculus', 'Calculus': 'Calculus',
  'Statistics': 'Statistics',
};
const GRADE_CHIP_LABELS = {
  'K': 'K', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8',
  'Pre-Algebra': 'Pre-A', 'Algebra I': 'Alg I', 'Geometry': 'Geo',
  'Algebra II': 'Alg II', 'Pre-Calculus': 'Pre-C', 'Calculus': 'Calc', 'Statistics': 'Stats',
};
// Bands group grades for the friendlier filter row.
// Pre-Algebra is treated as middle-school; Statistics is treated as high-school.
const GRADE_BANDS = [
  { id: 'elem', label: 'Elementary K–5', short: 'K–5',  grades: ['K','1','2','3','4','5'] },
  { id: 'mid',  label: 'Middle School',  short: 'Mid', grades: ['6','7','8','Pre-Algebra'] },
  { id: 'hs',   label: 'High School',    short: 'HS',   grades: ['Algebra I','Geometry','Algebra II','Pre-Calculus','Calculus','Statistics'] },
];
const TOPIC_GROUPS = [
  // Kindergarten
  { id:'add-sub-10', short:'Add/Subtract within 10', long:'Single-digit addition and subtraction',
    grades:{'K':'K.OA.5'}, fluency:{'K':true},
    variants:[{label:'Addition'},{label:'Subtraction'},{label:'Mixed'}] },
  { id:'decompose-teens', short:'Teen Decomposition', long:'Breaking apart numbers like 14 = 10 + ?',
    grades:{'K':'K.NBT.1'}, variants:[{label:'Default'}] },
  { id:'one-more-less', short:'One More, One Less', long:'Counting up or down by 1',
    grades:{'K':'K.CC.4c'}, variants:[{label:'Default'}] },

  // Grade 1
  { id:'add-sub-20', short:'Add/Subtract within 20', long:'Single-digit operations crossing the ten',
    grades:{'1':'1.OA.6'}, fluency:{'1':true},
    variants:[
      {label:'Addition: sums to 10'},
      {label:'Addition: sums 11–20'},
      {label:'Subtraction: minuends to 10'},
      {label:'Subtraction: minuends 11–20'},
    ] },
  { id:'ten-more-less', short:'10 More, 10 Less', long:'Mental jumps of ten',
    grades:{'1':'1.NBT.5'}, variants:[{label:'Default'}] },
  { id:'two-plus-one-digit', short:'2-Digit + 1-Digit', long:'Adding ones to two-digit numbers',
    grades:{'1':'1.NBT.4'}, variants:[{label:'Default'}] },
  { id:'missing-addend', short:'Missing Addend', long:'Find the unknown addend (e.g. 6 + ? = 13)',
    grades:{'1':'1.OA.8'}, variants:[{label:'Default'}] },

  // Grade 2
  { id:'add-sub-100', short:'Add/Subtract within 100', long:'Two-digit addition and subtraction',
    grades:{'2':'2.NBT.5'}, fluency:{'2':true},
    variants:[{label:'Within 50'},{label:'Within 100'}] },
  { id:'place-value', short:'Place Value', long:'Identify place values in multi-digit numbers',
    grades:{'2':'2.NBT.1'}, variants:[{label:'Default'}] },
  { id:'money-cents', short:'Money Totals', long:'Adding coins and bills (in cents)',
    grades:{'2':'2.MD.8'}, variants:[{label:'Default'}] },
  { id:'skip-counting', short:'Skip Counting', long:'Filling in missing numbers in skip-count sequences',
    grades:{'2':'2.NBT.2'}, variants:[{label:'Default'}] },

  // Grade 3
  { id:'mult-div-facts', short:'Multiplication & Division Facts', long:'Single-digit fact families within 100',
    grades:{'3':'3.OA.7'}, fluency:{'3':true},
    variants:[{label:'Multiplication'},{label:'Division'},{label:'Mixed'}] },
  { id:'add-sub-1000', short:'Add/Subtract within 1000', long:'Three-digit addition and subtraction',
    grades:{'3':'3.NBT.2'}, fluency:{'3':true}, variants:[{label:'Default'}] },
  { id:'rounding', short:'Rounding', long:'Round to nearest 10 or 100',
    grades:{'3':'3.NBT.1','4':'4.NBT.3'},
    variants:[{label:'Nearest 10'},{label:'Nearest 100'}] },
  { id:'rectangle-area', short:'Rectangle Area', long:'Area = length × width',
    grades:{'3':'3.MD.7'}, variants:[{label:'Default'}] },
  { id:'perimeter', short:'Perimeter', long:'Sum of all side lengths',
    grades:{'3':'3.MD.8'}, variants:[{label:'Default'}] },
  { id:'mult-multiples-10', short:'Multiplying by Multiples of 10', long:'Products of single digits and 10s',
    grades:{'3':'3.NBT.3'}, variants:[{label:'Default'}] },
  { id:'equiv-fractions', short:'Equivalent Fractions', long:'Find the missing numerator',
    grades:{'3':'3.NF.3b','4':'4.NF.1'}, variants:[{label:'Default'}] },

  // Grade 4
  { id:'multi-digit-add-sub', short:'Multi-Digit Add/Subtract', long:'Standard algorithm for large numbers',
    grades:{'4':'4.NBT.4'}, fluency:{'4':true}, variants:[{label:'Default'}] },
  { id:'multi-digit-mult', short:'Multi-Digit Multiplication', long:'Multiplying larger numbers',
    grades:{'4':'4.NBT.5','5':'5.NBT.5'},
    variants:[{label:'2-digit × 1-digit'},{label:'2-digit × 2-digit'}] },
  { id:'multi-digit-division', short:'Multi-Digit Division', long:'Division with multi-digit dividends',
    grades:{'4':'4.NBT.6','5':'5.NBT.6'},
    variants:[{label:'1-digit divisor'}] },
  { id:'frac-add-sub-like', short:'Like-Denominator Fractions', long:'Add and subtract fractions with same denominator',
    grades:{'4':'4.NF.3'}, variants:[{label:'Default'}] },
  { id:'frac-times-whole', short:'Fraction × Whole', long:'Multiplying a fraction by a whole number',
    grades:{'4':'4.NF.4'}, variants:[{label:'Default'}] },
  { id:'decimal-fraction-conv', short:'Decimal-Fraction Conversion', long:'Tenths and hundredths, both directions',
    grades:{'4':'4.NF.6'}, variants:[{label:'Default'}] },
  { id:'angle-additivity', short:'Angle Additivity', long:'Adjacent angles sum to a whole',
    grades:{'4':'4.MD.7'}, variants:[{label:'Default'}] },
  { id:'unit-conversion', short:'Unit Conversion', long:'Convert within measurement systems',
    grades:{'4':'4.MD.1','5':'5.MD.1'}, variants:[{label:'Default'}] },

  // Grade 5
  { id:'decimal-ops', short:'Decimal Operations', long:'Add, subtract, multiply with decimals',
    grades:{'5':'5.NBT.7'},
    variants:[{label:'Addition/Subtraction'},{label:'Multiplication'}] },
  { id:'frac-times-frac', short:'Multiplying Fractions', long:'Fraction × fraction',
    grades:{'5':'5.NF.4'}, variants:[{label:'Default'}] },
  { id:'frac-div', short:'Dividing Fractions', long:'Fraction and whole-number division',
    grades:{'5':'5.NF.7','6':'6.NS.1'},
    variants:[{label:'Fraction ÷ whole, whole ÷ unit fraction'},{label:'Fraction ÷ fraction'}] },
  { id:'volume-prisms', short:'Volume of Prisms', long:'Rectangular prism volume',
    grades:{'5':'5.MD.5'}, variants:[{label:'Default'}] },
  { id:'powers-of-10', short:'Powers of 10', long:'Multiplying and dividing by powers of 10',
    grades:{'5':'5.NBT.2'}, variants:[{label:'Default'}] },
  { id:'order-of-ops', short:'Order of Operations', long:'PEMDAS evaluation',
    grades:{'5':'5.OA.1','6':'6.EE.2c'}, variants:[{label:'Default'}] },

  // Grade 6
  { id:'gcf-lcm', short:'GCF & LCM', long:'Greatest common factor, least common multiple',
    grades:{'6':'6.NS.4'},
    variants:[{label:'GCF'},{label:'LCM'}] },
  { id:'absolute-value', short:'Absolute Value', long:'Distance from zero',
    grades:{'6':'6.NS.7c'}, variants:[{label:'Default'}] },
  { id:'unit-rates', short:'Unit Rates', long:'Rates per single unit',
    grades:{'6':'6.RP.2','7':'7.RP.1'}, variants:[{label:'Default'}] },
  { id:'percents', short:'Percents', long:'Find percent of a quantity',
    grades:{'6':'6.RP.3c','7':'7.RP.3'}, variants:[{label:'Default'}] },
  { id:'eval-expressions', short:'Evaluating Expressions', long:'Substitute values into algebraic expressions',
    grades:{'6':'6.EE.2c','7':'7.EE.2'}, variants:[{label:'Default'}] },
  { id:'one-step-eqs', short:'One-Step Equations', long:'Solve with one operation',
    grades:{'6':'6.EE.7'}, variants:[{label:'Default'}] },
  { id:'polygon-area', short:'Polygon Areas', long:'Triangles, parallelograms, trapezoids',
    grades:{'6':'6.G.1'},
    variants:[{label:'Triangles'},{label:'Parallelograms'},{label:'Trapezoids'}] },

  // Grade 7 — our existing 3 sets live in this group
  { id:'add-negatives', short:'Adding Negatives', long:'Adding & subtracting rational numbers',
    grades:{'6':'6.NS.5','7':'7.NS.1','Pre-Algebra':'7.NS.1'},
    fluency:{'7':true},
    variants:[
      {label:'Mixed', path:'sets/grade-6/integer-operations-addition-subtraction.csv', recommended:true},
      {label:'Addition only', path:'sets/grade-6/integer-operations-addition.csv'},
      {label:'Subtraction only', path:'sets/grade-6/integer-operations-subtraction.csv'},
      {label:'Including rationals (fractions/decimals)'},
    ] },
  { id:'mult-negatives', short:'Multiplying Negatives', long:'Multiplying & dividing rational numbers',
    grades:{'7':'7.NS.2','Pre-Algebra':'7.NS.2'}, fluency:{'7':true},
    variants:[{label:'Integers'},{label:'Including rationals'}] },
  { id:'two-step-eqs', short:'Two-Step Equations', long:'Solve with two operations',
    grades:{'7':'7.EE.4a'}, variants:[{label:'Default'}] },
  { id:'circle-area-circ', short:'Circle Area & Circumference', long:'Using π in answers',
    grades:{'7':'7.G.4'}, variants:[{label:'Area'},{label:'Circumference'}] },
  { id:'simple-prob', short:'Simple Probability', long:'Single-event likelihood',
    grades:{'7':'7.SP.5','Statistics':'S-CP'}, variants:[{label:'Default'}] },
  { id:'angle-relationships', short:'Angle Relationships', long:'Complementary, supplementary, vertical',
    grades:{'7':'7.G.5','8':'8.G.5'}, variants:[{label:'Default'}] },
  { id:'proportions', short:'Proportions', long:'Solving for missing parts of a proportion',
    grades:{'7':'7.RP.2','Pre-Algebra':'7.RP.2'}, variants:[{label:'Default'}] },
  { id:'inequalities', short:'Inequalities', long:'Boundary value of a one-variable inequality',
    grades:{'7':'7.EE.4b','Pre-Algebra':'7.EE.4b'}, variants:[{label:'Default'}] },

  // Grade 8 + cross-refs into Pre-Algebra/Algebra I
  { id:'exponent-rules', short:'Exponent Rules', long:'Product, quotient, and power rules',
    grades:{'8':'8.EE.1','Pre-Algebra':'8.EE.1','Algebra II':'F-LE'},
    variants:[{label:'Integer exponents'},{label:'Negative & zero exponents'}] },
  { id:'sq-cube-roots', short:'Square & Cube Roots', long:'Perfect squares and cubes',
    grades:{'8':'8.EE.2'},
    variants:[{label:'Squares to 225'},{label:'Cubes to 1000'}] },
  { id:'sci-notation', short:'Scientific Notation', long:'Operations in scientific notation',
    grades:{'8':'8.EE.4'}, calc:true, variants:[{label:'Default'}] },
  { id:'slope', short:'Slope', long:'Slope from points or equation',
    grades:{'8':'8.EE.6','Pre-Algebra':'8.F.3','Algebra I':'F-IF.7a'},
    variants:[{label:'From two points'},{label:'From y = mx + b'},{label:'From any form'}] },
  { id:'multi-step-eqs', short:'Multi-Step Equations', long:'Linear equations with multiple steps',
    grades:{'7':'7.EE.4a','8':'8.EE.7','Pre-Algebra':'8.EE.7b','Algebra I':'A-REI.3'},
    variants:[{label:'Variables on both sides'},{label:'With distribution'}] },
  { id:'pythagorean', short:'Pythagorean Theorem', long:'Right-triangle side lengths',
    grades:{'8':'8.G.7','Geometry':'G-SRT.8'},
    variants:[{label:'Integer triples'},{label:'Find hypotenuse'},{label:'Find leg'}] },
  { id:'function-eval', short:'Function Evaluation', long:'Evaluate functions at given inputs',
    grades:{'8':'8.F.1','Pre-Algebra':'F-IF.2','Algebra I':'F-IF.2'},
    variants:[{label:'Default'}] },
  { id:'function-notation', short:'Function Notation', long:'Reading and using f(x) notation',
    grades:{'Pre-Algebra':'F-IF.2','Algebra II':'F-IF.2'},
    variants:[{label:'Default'}] },

  // Algebra I
  { id:'quadratic-roots', short:'Quadratic Roots', long:'Discriminant and roots of factored quadratics',
    grades:{'Algebra I':'A-REI.4b','Algebra II':'A-REI.4b'},
    variants:[{label:'Discriminant value'},{label:'Sum of roots'},{label:'Product of roots'}] },
  { id:'distance-formula', short:'Distance Formula', long:'Distance between two points',
    grades:{'Algebra I':'G-GPE.7','Geometry':'G-GPE.7'},
    variants:[{label:'Integer triples'}] },
  { id:'midpoint-formula', short:'Midpoint Formula', long:'Midpoint of a line segment',
    grades:{'Algebra I':'G-GPE.6','Geometry':'G-GPE.6'},
    variants:[{label:'Single coordinate'}] },
  { id:'sequences', short:'Sequences', long:'Arithmetic and geometric, nth term',
    grades:{'Algebra I':'F-BF.2','Algebra II':'F-BF.2'},
    variants:[{label:'Arithmetic'},{label:'Geometric', calc:true}] },
  { id:'exponentials', short:'Exponential Functions', long:'Evaluating exponential expressions',
    grades:{'Algebra I':'F-LE','Algebra II':'F-LE.4'},
    variants:[{label:'Evaluation'},{label:'Solving exponential equations'}] },
  { id:'polynomial-eval', short:'Polynomial Evaluation', long:'Evaluate polynomials at a point',
    grades:{'Algebra I':'A-APR.1'}, variants:[{label:'Default'}] },

  // Geometry
  { id:'triangle-angles', short:'Triangle Angle Sum', long:'Interior angles of a triangle sum to 180°',
    grades:{'Geometry':'G-CO.10'}, variants:[{label:'Default'}] },
  { id:'polygon-angles', short:'Polygon Angle Sums', long:'Interior and exterior polygon angles',
    grades:{'Geometry':'G-CO.11'},
    variants:[{label:'Interior'},{label:'Exterior'}] },
  { id:'parallel-transversal', short:'Parallel Lines & Transversals', long:'Angle relationships across parallel lines',
    grades:{'8':'8.G.5','Geometry':'G-CO.9'}, variants:[{label:'Default'}] },
  { id:'special-right-tri', short:'Special Right Triangles', long:'45-45-90 and 30-60-90 ratios',
    grades:{'Geometry':'G-SRT.6'},
    variants:[{label:'45-45-90'},{label:'30-60-90'}] },
  { id:'right-tri-trig', short:'Right-Triangle Trig', long:'sin, cos, tan ratios',
    grades:{'Geometry':'G-SRT.8','Pre-Calculus':'G-SRT.8'}, calc:true,
    variants:[{label:'Find side'},{label:'Find angle'}] },
  { id:'circle-theorems', short:'Circle Theorems', long:'Inscribed and central angle relationships',
    grades:{'Geometry':'G-C.2'},
    variants:[{label:'Inscribed angles'},{label:'Central angles'}] },
  { id:'similar-triangles', short:'Similar Triangles', long:'Find missing side using similarity',
    grades:{'Geometry':'G-SRT.5'}, variants:[{label:'Default'}] },
  { id:'transformations', short:'Transformations', long:'Single transformations, image coordinates',
    grades:{'Geometry':'G-CO.5'},
    variants:[{label:'Translations'},{label:'Reflections'},{label:'Rotations'}] },

  // Algebra II
  { id:'logarithms', short:'Logarithms', long:'Evaluation, properties, equations',
    grades:{'Algebra II':'F-LE.4'},
    variants:[
      {label:'Integer answers'},
      {label:'Change of base', calc:true},
      {label:'Properties on a single value'},
      {label:'Solving exponential equations'},
    ] },
  { id:'function-comp', short:'Function Composition', long:'Output of f(g(x))',
    grades:{'Algebra II':'F-BF.1c'}, variants:[{label:'Default'}] },
  { id:'complex-numbers', short:'Complex Numbers', long:'Arithmetic and modulus',
    grades:{'Algebra II':'N-CN.2'},
    variants:[{label:'Real or imaginary part'},{label:'Modulus'}] },
  { id:'parabola-vertex', short:'Parabola Vertex', long:'Vertex coordinates of a parabola',
    grades:{'Algebra II':'F-IF.8a'},
    variants:[{label:'x-coordinate'},{label:'y-coordinate'}] },
  { id:'rational-asymptote', short:'Rational Function Asymptotes', long:'Vertical asymptote x-value',
    grades:{'Algebra II':'F-IF.7d'}, variants:[{label:'Default'}] },

  // Pre-Calculus
  { id:'trig-values', short:'Trig Values', long:'Unit circle and reference angles',
    grades:{'Pre-Calculus':'F-TF.2'},
    variants:[
      {label:'Unit circle exact'},
      {label:'Inverse trig at standard values'},
      {label:'Reference angle'},
      {label:'Non-special angles', calc:true},
    ] },
  { id:'trig-graphs', short:'Trig Graphs', long:'Period and amplitude',
    grades:{'Pre-Calculus':'F-TF.5'},
    variants:[{label:'Period'},{label:'Amplitude'}] },
  { id:'vectors', short:'Vectors', long:'Magnitude, dot product, components',
    grades:{'Pre-Calculus':'N-VM'},
    variants:[
      {label:'Magnitude', calc:true},
      {label:'Dot product'},
      {label:'Component'},
    ] },
  { id:'determinants', short:'2×2 Determinants', long:'Determinant of a 2×2 matrix',
    grades:{'Pre-Calculus':'N-VM.10'}, variants:[{label:'Default'}] },
  { id:'limits', short:'Limits', long:'Algebraic and at-infinity limits',
    grades:{'Pre-Calculus':'','Calculus':''},
    variants:[
      {label:'Algebraic (factor cancel)'},
      {label:'Limits at infinity'},
      {label:"L’Hôpital's rule"},
    ] },
  { id:'conics', short:'Conic Sections', long:'Center coordinate from completed-square form',
    grades:{'Pre-Calculus':'G-GPE'}, variants:[{label:'Default'}] },

  // Calculus
  { id:'derivatives', short:'Derivatives', long:'Polynomial derivatives at a point',
    grades:{'Calculus':''},
    variants:[{label:'Derivative at a point'},{label:'Tangent line slope'}] },
  { id:'integrals', short:'Definite Integrals', long:'Polynomials with clean antiderivatives',
    grades:{'Calculus':''}, variants:[{label:'Default'}] },
  { id:'critical-points', short:'Critical Points', long:'Critical and inflection x-values',
    grades:{'Calculus':''},
    variants:[{label:'Critical points'},{label:'Inflection points'}] },
  { id:'avg-rate', short:'Average Rate of Change', long:'Mean rate over an interval',
    grades:{'Calculus':''}, variants:[{label:'Default'}] },
  { id:'optimization', short:'Optimization', long:'Absolute max/min on a closed interval',
    grades:{'Calculus':''}, variants:[{label:'Default'}] },

  // Statistics
  { id:'z-scores', short:'Z-Scores', long:'Standardized scores in normal distributions',
    grades:{'Statistics':'S-ID.4'},
    variants:[{label:'Z-score'},{label:'Normal probability', calc:true}] },
  { id:'counting', short:'Counting Methods', long:'Combinations and permutations',
    grades:{'Statistics':'S-CP'}, calc:true,
    variants:[{label:'Combinations'},{label:'Permutations'}] },
];

// Derived helpers
function topicIsPlayable(group) {
  return group.variants.some(v => v.path);
}
// Return the deduped list of CCSS standards a group covers across the allowed
// grades. Each grades[gk] may be a string OR a string[]; both shapes are
// supported so a single grade can map to multiple standards without churn.
function topicAllStandards(group, allowed = GRADE_ORDER) {
  const set = new Set();
  for (const gk of allowed) {
    const v = group.grades[gk];
    if (v == null) continue;
    (Array.isArray(v) ? v : [v]).forEach(s => { if (s) set.add(s); });
  }
  return [...set];
}

function topicPrimaryGrade(group, allowed = GRADE_ORDER) {
  // Pick the single best grade for this group within the allowed set:
  // 1. fluency grade if it's in allowed
  // 2. earliest grade (per GRADE_ORDER) that's in both group.grades and allowed
  const grades = Object.keys(group.grades);
  if (group.fluency) {
    for (const gk of GRADE_ORDER) {
      if (allowed.includes(gk) && grades.includes(gk) && group.fluency[gk]) return gk;
    }
  }
  for (const gk of GRADE_ORDER) {
    if (allowed.includes(gk) && grades.includes(gk)) return gk;
  }
  return null;
}

/* ============================================================
   CSV PARSER (handles quoted fields, CRLF/LF, whitespace)
   ============================================================ */
function parseCSVText(text) {
  const rows = [];
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let i = 0;
  while (i <= raw.length) {
    const row = [];
    while (true) {
      let field = '';
      if (i < raw.length && raw[i] === '"') {
        i++; // skip opening quote
        while (i < raw.length) {
          if (raw[i] === '"' && raw[i+1] === '"') { field += '"'; i += 2; }
          else if (raw[i] === '"') { i++; break; }
          else { field += raw[i++]; }
        }
        // skip to comma or newline
        while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n') i++;
      } else {
        while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n') {
          field += raw[i++];
        }
      }
      row.push(field.trim());
      if (i >= raw.length || raw[i] === '\n') { i++; break; }
      i++; // skip comma
    }
    if (row.length === 1 && row[0] === '') {
      if (i > raw.length) break;
      continue;
    }
    rows.push(row);
    if (i > raw.length) break;
  }
  return rows;
}

/* ============================================================
   PROBLEM LOADER & VALIDATOR
   ============================================================ */
const BINGO_COLS = ['B','I','N','G','O'];
const VALID_COLS = new Set(BINGO_COLS);

function loadProblems(csvText, filename) {
  const rows = parseCSVText(csvText);
  const errors = [];
  const problems = [];
  const allRows = []; // includes invalid rows for the editor

  if (rows.length < 2) {
    errors.push('File appears empty or has no data rows.');
    return { problems, errors, allRows };
  }

  // Identify header
  const header = rows[0].map(h => h.toLowerCase().trim());
  const colIdx     = header.indexOf('column');
  const probIdx    = header.indexOf('problem');
  const answerIdx  = header.indexOf('answer');

  if (colIdx < 0 || probIdx < 0 || answerIdx < 0) {
    const missing = [];
    if (colIdx    < 0) missing.push('column');
    if (probIdx   < 0) missing.push('problem');
    if (answerIdx < 0) missing.push('answer');
    errors.push(`Missing required header${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected: column, problem, answer.`);
    return { problems, errors, allRows };
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= Math.max(colIdx, probIdx, answerIdx)) continue;

    const col    = row[colIdx].trim().toUpperCase();
    const prob   = row[probIdx].trim();
    const ansRaw = row[answerIdx].trim();

    const rowErrors = [];
    if (!VALID_COLS.has(col))               rowErrors.push('Column must be B, I, N, G, or O');
    if (!prob)                              rowErrors.push('Problem is empty');
    const ansNum = parseFloat(ansRaw);
    if (ansRaw === '')          rowErrors.push('Answer is required');
    else if (isNaN(ansNum))     rowErrors.push('Answer must be a number');

    const editRow = { id: newRowId(), column: col || '', problem: prob, answer: ansRaw, errors: rowErrors };
    allRows.push(editRow);

    if (rowErrors.length === 0) {
      problems.push({ column: col, problem: prob, answer: ansNum });
    }
  }

  if (problems.length === 0) {
    errors.push('No valid problems found in file.');
    return { problems, errors, allRows };
  }

  return { problems, errors, allRows };
}

/* ============================================================
   SETTINGS (suite-shared storage)
   - Suite-wide preferences (theme, sound) live in storage.preferences
     so other tools can read them.
   - Bingo-specific settings live in storage.tools.bingo.settings.
   - Custom user-uploaded problem sets live in storage.tools.bingo.customSets
     (see customSets section further down).
   ============================================================ */
const SUITE_PREF_KEYS = ['theme', 'soundEnabled', 'soundMuted', 'soundVolume'];
const DEFAULT_SETTINGS = {
  theme: 'light',
  showBoard: true,
  boardContent: 'problems',   // 'problems' | 'answers'
  showColumn: true,
  showNavButtons: true,
  showProgress: false,
  showRecentBalls: true,
  autoAdvanceOn: false,
  autoAdvanceInterval: 20,
  boardMode: 'recent',  // 'grid' | 'recent'
  recentCount: 5,       // 1–10
  recentBallScale: 1.5, // 0.5–2.5
  cardColors: { B: '#1565c0', I: '#2e7d32', N: '#e65100', G: '#6a1b9a', O: '#b71c1c' },
  ballAnimation: 'drop',     // 'drop' | 'pop' | 'roll' | 'none'
  soundEnabled: true,
  soundMuted: false,
  soundVolume: 0.6,          // 0.0 – 1.0
  soundTick: true,
  font: 'default',  // 'default' | 'inter' | 'alfa-slab-one' | 'comic-neue' | 'creepster' | 'jetbrains-mono'
};

// PDF TTF URLs from the official google/fonts GitHub repo via jsDelivr.
// (@fontsource v5 only ships WOFF2 which jsPDF cannot embed.)
const _GFONTS = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl';
const FONT_OPTIONS = {
  'default':         { label: 'Default (Helvetica)',  pdfName: 'helvetica',     cssStack: 'system-ui, -apple-system, sans-serif' },
  'inter':           { label: 'Inter',                pdfName: 'Inter',         cssStack: '"Inter", sans-serif',         pdfUrls: { normal: `${_GFONTS}/inter/Inter%5Bopsz%2Cwght%5D.ttf` } },
  'alfa-slab-one':   { label: 'Alfa Slab One',        pdfName: 'AlfaSlabOne',   cssStack: '"Alfa Slab One", serif',      pdfUrls: { normal: `${_GFONTS}/alfaslabone/AlfaSlabOne-Regular.ttf` } },
  'comic-neue':      { label: 'Comic Neue',           pdfName: 'ComicNeue',     cssStack: '"Comic Neue", cursive',       pdfUrls: { normal: `${_GFONTS}/comicneue/ComicNeue-Regular.ttf`, bold: `${_GFONTS}/comicneue/ComicNeue-Bold.ttf` } },
  'creepster':       { label: 'Creepster',            pdfName: 'Creepster',     cssStack: '"Creepster", cursive',        pdfUrls: { normal: `${_GFONTS}/creepster/Creepster-Regular.ttf` } },
  'jetbrains-mono':  { label: 'JetBrains Mono',       pdfName: 'JetBrainsMono', cssStack: '"JetBrains Mono", monospace', pdfUrls: { normal: `${_GFONTS}/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf` } },
};

function loadSettings() {
  const merged = Object.assign({}, DEFAULT_SETTINGS, { cardColors: { ...DEFAULT_SETTINGS.cardColors } });

  // Suite-wide preferences override defaults.
  for (const k of SUITE_PREF_KEYS) {
    const v = sharedStorage.getPreference(k, undefined);
    if (v !== undefined) merged[k] = v;
  }

  // Bingo-specific settings.
  const tool = sharedStorage.getToolState('bingo') || {};
  if (tool.settings && typeof tool.settings === 'object') {
    Object.assign(merged, tool.settings);
    if (tool.settings.cardColors) {
      merged.cardColors = Object.assign({}, DEFAULT_SETTINGS.cardColors, tool.settings.cardColors);
    }
  }

  return merged;
}

/* ============================================================
   AUDIO (file paths — relative to bingo/index.html, in the suite's
   shared assets folder)
   ============================================================ */
const SOUND_FILES = {
  drop: '../assets/sounds/bingo/Drop-Bounce.flac',
  pop:  '../assets/sounds/bingo/Pop-Spring.flac',
  roll: '../assets/sounds/bingo/Roll-In.flac',
  tick: '../assets/sounds/bingo/Ticking.flac',
};

// Animation durations in seconds — auto-updated from audio file metadata
// once the browser loads each file. Tweak these if timing feels off.
const ANIM_DURATIONS = { drop: 0.62, pop: 0.45, roll: 0.70 };

// Paths to Bingo celebration sounds (relative to bingo/index.html).
// Drop new audio files in assets/sounds/bingo/celebration/ and add them here.
const BINGO_SOUNDS = [
  '../assets/sounds/bingo/celebration/partyblower.mp3',
  '../assets/sounds/bingo/celebration/shoso_kansei_short_st.wav',
];

const audio = (() => {
  const cache = {};
  let unlocked = false;
  let tickEl = null; // tracked so it can be stopped on demand

  function loadAll() {
    Object.entries(SOUND_FILES).forEach(([name, path]) => {
      const a = new Audio(path);
      a.preload = 'auto';
      a.volume = (state.settings && state.settings.soundMuted) ? 0
               : (state.settings && state.settings.soundVolume != null ? state.settings.soundVolume : 0.6);
      cache[name] = a;
      // Auto-update animation duration once the file's metadata is known
      if (name in ANIM_DURATIONS) {
        a.addEventListener('loadedmetadata', () => {
          if (a.duration && isFinite(a.duration)) ANIM_DURATIONS[name] = a.duration;
        });
      }
    });
  }

  function unlock() {
    if (unlocked) return;
    Object.values(cache).forEach(a => {
      a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
    });
    unlocked = true;
  }

  function applyVolumeToAll() {
    const v = state.settings.soundMuted ? 0 : state.settings.soundVolume;
    Object.values(cache).forEach(a => { a.volume = v; });
  }

  return {
    init: loadAll,
    unlock,
    setVolume: applyVolumeToAll,
    setMuted:  applyVolumeToAll,
    play(name) {
      if (!state.settings.soundEnabled || state.settings.soundMuted) return;
      if (name === 'ballDrop') {
        const variant = state.settings.ballAnimation;
        if (!variant || variant === 'none') return;
        name = variant;  // resolve to drop / pop / roll
      } else if (name === 'tick') {
        if (!state.settings.soundTick) return;
        // Stop any still-playing tick before starting a new one
        stopTick();
        const src = cache['tick'];
        if (!src) return;
        tickEl = src.cloneNode();
        tickEl.volume = state.settings.soundVolume;
        tickEl.play().catch(() => {});
        tickEl.addEventListener('ended', () => { tickEl = null; });
        return;
      }
      const src = cache[name];
      if (!src) return;
      const a = src.cloneNode();
      a.volume = state.settings.soundVolume;
      a.play().catch(() => {});
    },
    stopTick
  };

  function stopTick() {
    if (tickEl) {
      try { tickEl.pause(); tickEl.currentTime = 0; } catch(e) {}
      tickEl = null;
    }
  }
})();

// Unlock audio on first user gesture (browser autoplay policy)
['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
  window.addEventListener(ev, () => audio.unlock(), { passive: true })
);


function saveSettings() {
  const s = state.settings;
  if (!s) return;

  // Suite-wide preferences (visible to other tools).
  for (const k of SUITE_PREF_KEYS) {
    if (s[k] !== undefined) {
      try { sharedStorage.setPreference(k, s[k]); } catch (e) {
        if (e && e.name === 'StorageQuotaError') showNotification([e.message], 'error');
      }
    }
  }

  // Bingo-specific settings (everything not in SUITE_PREF_KEYS).
  const toolSpecific = {};
  for (const [k, v] of Object.entries(s)) {
    if (!SUITE_PREF_KEYS.includes(k)) toolSpecific[k] = v;
  }

  try {
    const existing = sharedStorage.getToolState('bingo') || {};
    sharedStorage.setToolState('bingo', { ...existing, settings: toolSpecific });
  } catch (e) {
    if (e && e.name === 'StorageQuotaError') showNotification([e.message], 'error');
  }
}

/* ============================================================
   CUSTOM SETS PERSISTENCE
   New behavior: user-uploaded CSV problem sets are saved to the
   suite's shared storage so they survive a reload.
   ============================================================ */
function loadCustomSets() {
  const tool = sharedStorage.getToolState('bingo') || {};
  return Array.isArray(tool.customSets) ? tool.customSets : [];
}

function saveCustomSet(name, csvText) {
  if (!name || !csvText) return;
  const tool = sharedStorage.getToolState('bingo') || {};
  const sets = Array.isArray(tool.customSets) ? tool.customSets.slice() : [];
  // Replace by name if already saved; otherwise append.
  const idx = sets.findIndex((s) => s && s.name === name);
  const entry = { name, csv: csvText, savedAt: new Date().toISOString() };
  if (idx >= 0) sets[idx] = entry;
  else sets.push(entry);
  try {
    sharedStorage.setToolState('bingo', { ...tool, customSets: sets });
  } catch (e) {
    if (e && e.name === 'StorageQuotaError') showNotification([e.message], 'error');
  }
}

function deleteCustomSet(name) {
  const tool = sharedStorage.getToolState('bingo') || {};
  const sets = Array.isArray(tool.customSets) ? tool.customSets.filter((s) => s && s.name !== name) : [];
  try {
    sharedStorage.setToolState('bingo', { ...tool, customSets: sets });
  } catch (e) {
    if (e && e.name === 'StorageQuotaError') showNotification([e.message], 'error');
  }
}

/* ============================================================
   CLASSROOM EXPORT / IMPORT
   Saves and restores the entire suite (all tools) as a JSON file.
   ============================================================ */
function triggerClassroomExport() {
  try {
    sharedStorage.downloadExport();
  } catch (e) {
    showNotification(['Export failed: ' + (e && e.message ? e.message : 'unknown error')], 'error');
  }
}

function triggerClassroomImport() {
  // Open a file picker without committing to a mode yet — we'll ask after parsing.
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEv) => {
      let parsed;
      try {
        parsed = JSON.parse(loadEv.target.result);
      } catch (e) {
        showNotification(['Import failed: that file is not valid JSON.'], 'error');
        return;
      }
      askImportMode((mode) => {
        if (!mode) return; // cancelled
        try {
          sharedStorage.importClassroom(parsed, mode);
          showNotification(['Imported successfully. Reloading…'], 'success');
          // Reload so all tools pick up the fresh state cleanly.
          setTimeout(() => location.reload(), 600);
        } catch (e) {
          showNotification(['Import failed: ' + (e && e.message ? e.message : 'unknown error')], 'error');
        }
      });
    };
    reader.readAsText(file);
  };
  input.click();
}

// Lightweight modal: "Replace existing data, or merge?"
function askImportMode(callback) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="panel confirm-panel">
      <div class="panel-header"><h2>Import classroom data</h2></div>
      <div class="panel-body">
        <p>Replace your current data with the imported file, or merge them?</p>
        <div class="confirm-buttons">
          <button class="btn-danger" data-mode="replace">Replace</button>
          <button data-mode="merge">Merge</button>
          <button data-mode="">Cancel</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    const mode = btn.dataset.mode || '';
    document.body.removeChild(overlay);
    callback(mode);
  });
}

function playBingoSound() {
  if (!state.settings.soundEnabled || state.settings.soundMuted) return;
  if (!BINGO_SOUNDS.length) return;
  const path = BINGO_SOUNDS[Math.floor(Math.random() * BINGO_SOUNDS.length)];
  const a = new Audio(path);
  a.volume = state.settings.soundVolume;
  a.play().catch(() => {});
}

function triggerConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  document.body.appendChild(canvas);
  const W = canvas.width  = window.innerWidth;
  const H = canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const COLORS = ['#f7b731','#26de81','#fd9644','#4bcffa','#fd79a8',
                  '#a29bfe','#55efc4','#fdcb6e','#e17055','#74b9ff'];
  const particles = Array.from({ length: 120 }, () => ({
    x:   Math.random() * W,
    y:   -10 - Math.random() * 40,
    vx:  (Math.random() - 0.5) * 3,
    vy:  2 + Math.random() * 4,
    w:   6 + Math.random() * 8,
    h:   10 + Math.random() * 6,
    rot: Math.random() * Math.PI * 2,
    dr:  (Math.random() - 0.5) * 0.18,
    col: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  let rafId;
  function frame() {
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.rot += p.dr;
      if (p.y < H + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (alive) { rafId = requestAnimationFrame(frame); } else { canvas.remove(); }
  }
  rafId = requestAnimationFrame(frame);
  setTimeout(() => { cancelAnimationFrame(rafId); canvas.remove(); }, 6000);
}

function triggerBingo() {
  closeOverlay('check-answers-overlay');
  triggerConfetti();
  playBingoSound();
}

/* ============================================================
   GAME STATE
   ============================================================ */
const state = {
  problems: [],
  editRows: [],        // [{ id, column, problem, answer(str), errors[] }] — all rows including invalid
  queue: [],
  history: [],
  currentIndex: -1,
  calledAnswers: {},   // { B: Set<number>, I: Set<number>, ... }
  columnAnswers: {},   // { B: number[], ... } — sorted distinct answers per column
  setName: '',
  gameOver: false,
  currentView: 'home',
  settings: loadSettings(),
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildColumnAnswers(problems) {
  const map = {};
  for (const p of problems) {
    if (!map[p.column]) map[p.column] = new Set();
    map[p.column].add(p.answer);
  }
  const result = {};
  for (const [col, vals] of Object.entries(map)) {
    result[col] = [...vals].sort((a,b) => a - b);
  }
  return result;
}

function initGame() {
  state.queue = shuffle(state.problems);
  state.history = [];
  state.currentIndex = -1;
  state.calledAnswers = { B: new Set(), I: new Set(), N: new Set(), G: new Set(), O: new Set() };
  state.gameOver = false;
  resetRenderState();
}

function currentProblem() {
  return state.currentIndex >= 0 ? state.history[state.currentIndex] : null;
}

function isReplay() {
  return state.currentIndex >= 0 && state.currentIndex < state.history.length - 1;
}

function canGoNext() {
  // can advance through history or draw new
  if (state.currentIndex < state.history.length - 1) return true;
  return !state.gameOver && state.queue.length > 0;
}

function nextProblem() {
  // if we're in the middle of history, just move forward
  if (state.currentIndex < state.history.length - 1) {
    state.currentIndex++;
    state.answerVisible = false;
    return true;
  }
  if (state.gameOver) return false;

  // draw from queue, skipping already-called answers
  while (state.queue.length > 0) {
    const p = state.queue.shift();
    const called = state.calledAnswers[p.column] || new Set();
    if (called.has(p.answer)) continue;

    // valid new problem
    if (!state.calledAnswers[p.column]) state.calledAnswers[p.column] = new Set();
    state.calledAnswers[p.column].add(p.answer);
    state.history.push(p);
    state.currentIndex = state.history.length - 1;
    state.answerVisible = false;
    return true;
  }

  state.gameOver = true;
  return false;
}

function prevProblem() {
  if (state.currentIndex <= 0) return false;
  state.currentIndex--;
  state.answerVisible = false;
  return true;
}

function toggleAnswer() {
  state.answerVisible = !state.answerVisible;
}

function resetGame() {
  stopTimer();
  initGame();
}

/* ============================================================
   VIEW SWITCHING
   ============================================================ */
function showView(view) {
  if (view !== 'caller') stopTimer();
  state.currentView = view;
  document.getElementById('homepage-view').hidden = (view !== 'home');
  document.getElementById('print-view').hidden    = (view !== 'print');
  document.getElementById('app').hidden            = (view !== 'caller');
  document.getElementById('btn-back-home').hidden  = (view !== 'caller');
}

function applyLoadedSet(problems, name, allRows = null) {
  state.problems      = problems;
  state.setName       = name;
  state.columnAnswers = buildColumnAnswers(problems);
  // Populate editRows — use allRows from CSV parse (preserves invalid rows)
  // or derive from valid problems if allRows not provided
  state.editRows = allRows
    ? allRows
    : problems.map(p => ({ id: newRowId(), column: p.column, problem: p.problem, answer: String(p.answer), errors: [] }));
}

// Find a variant by its CSV path. Returns { group, variant } or null.
function findTopicByPath(path) {
  for (const group of TOPIC_GROUPS) {
    const variant = group.variants.find(v => v.path === path);
    if (variant) return { group, variant };
  }
  return null;
}

function fetchAndLoadSet(set, label, action, errElId = 'hp-set-error') {
  const go = csv => {
    const { problems, errors, allRows } = loadProblems(csv, label);
    if (errors.length) {
      const el = document.getElementById(errElId);
      if (el) { el.textContent = errors.join(' · '); el.hidden = false; }
      return;
    }
    applyLoadedSet(problems, label, allRows);
    if (action === 'host') {
      resetGame(); showView('caller'); computeProblemFontSize(); render();
    } else {
      showView('print'); renderPrintView();
    }
  };
  if (set.path) {
    if (location.protocol === 'file:') {
      const el = document.getElementById(errElId);
      if (el) { el.textContent = 'Pre-built sets require an HTTP server. Open via VS Code Live Server, or host online.'; el.hidden = false; }
      return;
    }
    fetch(set.path, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(); return r.text(); })
      .then(go).catch(() => {
        const el = document.getElementById(errElId);
        if (el) { el.textContent = '⚠ Could not load set file.'; el.hidden = false; }
      });
  } else if (set.csv) {
    go(set.csv);
  }
}

function loadSetAndPlay(csv, filename, errorElId = null) {
  // Clear any previous error before processing
  if (errorElId) {
    const el = document.getElementById(errorElId);
    if (el) el.hidden = true;
  }
  const { problems, errors, allRows } = loadProblems(csv, filename);
  if (errors.length) {
    if (errorElId) {
      const el = document.getElementById(errorElId);
      if (el) { el.textContent = errors.join(' · '); el.hidden = false; }
    } else {
      showNotification(errors, 'error');
    }
    return;
  }
  const name = filename.replace(/\.csv$/i, '').replace(/[-_]/g, ' ');
  applyLoadedSet(problems, name, allRows);
  resetGame();
  showView('caller');
  computeProblemFontSize();
  render();
}

// Homepage filter state — persists across re-renders within a session
// band: '' (All) or band id ('elem','mid','hs','stat')
// grade: '' (no grade picked) or specific gradeKey
// expandedId: id of the topic group whose variants are currently expanded ('' = none)
const _hpFilter = { band: '', grade: '', query: '', expandedId: '' };

function renderHomepage() {
  const container = document.getElementById('hp-tiles');

  // Quick-start actions
  const actionTile = `
    <div class="hp-tile hp-tile-actions">
      <div class="hp-tile-header">Get Started</div>
      <div class="hp-upload-row">
        <button class="hp-btn" id="hp-choose-file-btn"><svg class="icon" aria-hidden="true"><use href="#icon-upload"/></svg> Choose File</button>
        <button class="hp-btn" id="hp-new-blank-btn"><svg class="icon" aria-hidden="true"><use href="#icon-file-plus"/></svg> New Blank Set</button>
        <button class="hp-btn" id="hp-format-help-btn">Format Help</button>
        <button class="hp-btn" id="hp-dl-template-btn">Download Template</button>
      </div>
      <div id="hp-upload-error" hidden></div>
    </div>`;

  // Topic picker section — search + band/grade chips + filtered list
  const availableTile = `
    <div class="hp-tile hp-tile-sets">
      <div class="hp-tile-header">Pick a topic to play</div>
      <div class="hp-search-wrap">
        <input id="hp-search" class="hp-search" type="search"
          placeholder="Search topics or standards…"
          value="${escHtml(_hpFilter.query)}"
          aria-label="Search topics">
      </div>
      <div class="hp-chips hp-band-row" id="hp-bands" role="tablist" aria-label="Filter by grade band">
        <button class="hp-chip${_hpFilter.band === '' ? ' active' : ''}" data-band="">All</button>
        ${GRADE_BANDS.map(b => `<button class="hp-chip${_hpFilter.band === b.id ? ' active' : ''}" data-band="${escHtml(b.id)}">${escHtml(b.label)}</button>`).join('')}
      </div>
      <div class="hp-chips hp-grade-row" id="hp-grades" aria-label="Filter by specific grade"></div>
      <div id="hp-sets-list" class="hp-sets-list" aria-live="polite"></div>
      <div class="hp-roadmap-foot">
        <button class="hp-link-btn" id="hp-roadmap-btn">Browse all topics <svg class="icon" aria-hidden="true"><use href="#icon-chevron-right"/></svg></button>
      </div>
    </div>`;

  // "My sets" tile: lists user-uploaded CSV sets that have been persisted.
  const customSets = loadCustomSets();
  const customTile = customSets.length
    ? `<div class="hp-tile">
         <div class="hp-tile-header">My sets</div>
         <div class="hp-set-cards">
           ${customSets.map((set) => `
             <div class="hp-set-card" role="group" aria-label="${escHtml(set.name)}">
               <div class="hp-set-card-header">
                 <div>
                   <div class="hp-set-name">${escHtml(set.name)}</div>
                   <div class="hp-set-long">Saved ${escHtml(set.savedAt ? set.savedAt.slice(0,10) : '')}</div>
                 </div>
               </div>
               <div class="hp-upload-row" style="margin-top:10px">
                 <button class="hp-btn primary" data-cs-action="play"  data-cs-name="${escHtml(set.name)}">Host Game</button>
                 <button class="hp-btn"         data-cs-action="edit"  data-cs-name="${escHtml(set.name)}">Edit / Print</button>
                 <button class="hp-btn"         data-cs-action="delete" data-cs-name="${escHtml(set.name)}">Delete</button>
               </div>
             </div>
           `).join('')}
         </div>
       </div>`
    : '';

  container.innerHTML = actionTile + customTile + availableTile;

  // Wire custom-set actions
  if (customSets.length) {
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cs-action]');
      if (!btn) return;
      const action = btn.dataset.csAction;
      const name = btn.dataset.csName;
      const set = loadCustomSets().find((s) => s.name === name);
      if (!set) return;
      if (action === 'play') {
        loadSetAndPlay(set.csv, set.name + '.csv');
      } else if (action === 'edit') {
        const { problems, errors, allRows } = loadProblems(set.csv, set.name);
        applyLoadedSet(problems, set.name, allRows);
        showView('print'); renderPrintView();
        const errEl = document.getElementById('pv-load-error');
        if (errEl) {
          if (errors.length) { errEl.textContent = errors.join('\n'); errEl.hidden = false; }
          else { errEl.hidden = true; }
        }
      } else if (action === 'delete') {
        if (confirm(`Delete saved set "${name}"? This cannot be undone.`)) {
          deleteCustomSet(name);
          renderHomepage();
        }
      }
    }, { once: true });
    // Note: { once: true } ensures we don't stack handlers across re-renders.
    // (Re-renders rebuild the tile and re-attach.)
  }

  // Wire actions
  document.getElementById('hp-choose-file-btn').onclick = () => document.getElementById('file-input').click();
  document.getElementById('hp-new-blank-btn').onclick = () => {
    state.editRows = [];
    state.problems = [];
    state.columnAnswers = {};
    state.setName = 'New Set';
    showView('print');
    renderPrintView();
    document.getElementById('pv-add-row-btn')?.focus();
  };
  document.getElementById('hp-format-help-btn').onclick = () => openOverlay('csv-help-overlay');
  document.getElementById('hp-dl-template-btn').onclick = () => downloadTemplate();
  document.getElementById('hp-roadmap-btn').onclick = () => { renderRoadmapOverlay(); openOverlay('roadmap-overlay'); };

  // Search input
  const searchEl = document.getElementById('hp-search');
  searchEl.addEventListener('input', () => {
    _hpFilter.query = searchEl.value;
    _hpFilter.expandedId = '';
    renderAvailableSets();
  });

  // Band chips (top row)
  document.getElementById('hp-bands').addEventListener('click', e => {
    const chip = e.target.closest('.hp-chip');
    if (!chip) return;
    _hpFilter.band = chip.dataset.band;
    _hpFilter.grade = '';
    _hpFilter.expandedId = '';
    document.querySelectorAll('#hp-bands .hp-chip').forEach(c => c.classList.toggle('active', c === chip));
    renderGradeChips();
    renderAvailableSets();
  });

  // Grade chips delegated (rendered into #hp-grades on band selection)
  document.getElementById('hp-grades').addEventListener('click', e => {
    const chip = e.target.closest('.hp-chip');
    if (!chip) return;
    _hpFilter.grade = chip.dataset.grade;
    _hpFilter.expandedId = '';
    document.querySelectorAll('#hp-grades .hp-chip').forEach(c => c.classList.toggle('active', c === chip));
    renderAvailableSets();
  });

  renderGradeChips();
  renderAvailableSets();
}

// Render the second-row grade chips when a band is selected
function renderGradeChips() {
  const row = document.getElementById('hp-grades');
  if (!row) return;
  if (!_hpFilter.band) { row.innerHTML = ''; row.hidden = true; return; }
  const band = GRADE_BANDS.find(b => b.id === _hpFilter.band);
  if (!band) { row.innerHTML = ''; row.hidden = true; return; }
  row.hidden = false;
  row.innerHTML = `
    <button class="hp-chip${_hpFilter.grade === '' ? ' active' : ''}" data-grade="">All ${escHtml(band.short)}</button>
    ${band.grades.map(gk => `<button class="hp-chip${_hpFilter.grade === gk ? ' active' : ''}" data-grade="${escHtml(gk)}">${escHtml(GRADE_CHIP_LABELS[gk])}</button>`).join('')}
  `;
}

// Determine which grades a given filter combination should display.
// Returns an ordered list of grade keys (sorted by GRADE_ORDER).
function _activeGrades() {
  if (_hpFilter.grade) return [_hpFilter.grade];
  if (_hpFilter.band) {
    const band = GRADE_BANDS.find(b => b.id === _hpFilter.band);
    return band ? band.grades : [];
  }
  return GRADE_ORDER.slice();
}

// Search predicate against a topic group
function _topicMatchesQuery(group, q) {
  if (!q) return true;
  q = q.toLowerCase();
  if (group.short.toLowerCase().includes(q)) return true;
  if (group.long.toLowerCase().includes(q)) return true;
  if (topicAllStandards(group).some(s => s.toLowerCase().includes(q))) return true;
  if (Object.keys(group.grades).some(gk => (GRADE_LABELS[gk]||'').toLowerCase().includes(q))) return true;
  if (group.variants.some(v => v.label.toLowerCase().includes(q))) return true;
  return false;
}

// Render filtered playable topic groups. Each group appears AT MOST ONCE,
// bucketed under its "primary" grade for the active filter (fluency grade
// preferred, else earliest grade in the active range).
function renderAvailableSets() {
  const listEl = document.getElementById('hp-sets-list');
  if (!listEl) return;

  const activeGrades = _activeGrades();
  const q = _hpFilter.query.trim();
  const specificGrade = _hpFilter.grade;  // when set, force bucket to this grade

  // 1. Pick playable groups that have at least one entry in the active range
  //    and match the search query.
  const playable = TOPIC_GROUPS.filter(g =>
    topicIsPlayable(g) &&
    _topicMatchesQuery(g, q) &&
    Object.keys(g.grades).some(gk => activeGrades.includes(gk))
  );

  // 2. Bucket each group into exactly one grade.
  const byGrade = {};
  playable.forEach(g => {
    const bucket = specificGrade
      ? (g.grades[specificGrade] !== undefined ? specificGrade : null)
      : topicPrimaryGrade(g, activeGrades);
    if (bucket) (byGrade[bucket] = byGrade[bucket] || []).push(g);
  });

  const sections = GRADE_ORDER.filter(gk => byGrade[gk]).map(gk => ({ gk, groups: byGrade[gk] }));

  if (sections.length === 0) {
    const filterDesc = _hpFilter.grade
      ? GRADE_LABELS[_hpFilter.grade]
      : (_hpFilter.band ? GRADE_BANDS.find(b => b.id === _hpFilter.band)?.label : (q ? `"${escHtml(q)}"` : 'this view'));
    listEl.innerHTML = `<div class="hp-empty">
      <p>Nothing built for <strong>${filterDesc}</strong> yet.</p>
      <p class="hp-empty-hint">Peek at the <button class="hp-link-btn-inline" id="hp-empty-roadmap">topic roadmap</button> to see what's coming, or upload your own CSV above.</p>
    </div>`;
    document.getElementById('hp-empty-roadmap')?.addEventListener('click', () => { renderRoadmapOverlay(); openOverlay('roadmap-overlay'); });
    return;
  }

  listEl.innerHTML = sections.map(({ gk, groups }) => `
    <div class="hp-grade-group">
      <div class="hp-grade-label">${escHtml(GRADE_LABELS[gk])}</div>
      <div class="hp-set-cards">${groups.map(g => _renderTopicCard(g, gk)).join('')}</div>
    </div>
  `).join('');

  // Wire interactions via delegation
  listEl.onclick = e => {
    // Variant button click → load the set
    const variantBtn = e.target.closest('.hp-variant-btn[data-path]');
    if (variantBtn) {
      const topic = findTopicByPath(variantBtn.dataset.path);
      if (!topic) return;
      document.getElementById('hp-set-error').hidden = true;
      const variantSuffix = topic.group.variants.length > 1 ? ` — ${topic.variant.label}` : '';
      const label = `${GRADE_LABELS[variantBtn.dataset.gk] || ''} — ${topic.group.short}${variantSuffix}`.replace(/^ — /, '');
      fetchAndLoadSet(topic.variant, label, 'print');
      return;
    }
    // Card click → either expand variants or launch directly
    const card = e.target.closest('.hp-set-card');
    if (!card) return;
    const id = card.dataset.id;
    const group = TOPIC_GROUPS.find(g => g.id === id);
    if (!group) return;
    const playableVariants = group.variants.filter(v => v.path);
    if (playableVariants.length === 1) {
      // Single variant — launch directly
      const v = playableVariants[0];
      const gk = card.dataset.gk;
      document.getElementById('hp-set-error').hidden = true;
      const label = `${GRADE_LABELS[gk]} — ${group.short}`;
      fetchAndLoadSet(v, label, 'print');
      return;
    }
    // Multiple variants — toggle expansion
    _hpFilter.expandedId = (_hpFilter.expandedId === id) ? '' : id;
    renderAvailableSets();
  };
}

// Render a single topic card for a given group + grade context.
// Standards shown:
//   - specific grade selected → only that grade's standards
//   - "All" or band view → deduped union of standards across all active grades
function _renderTopicCard(group, gk) {
  const stdGrades = _hpFilter.grade ? [gk] : _activeGrades();
  const stdText = topicAllStandards(group, stdGrades).join(' · ');
  const isFluency = !!(group.fluency && group.fluency[gk]);
  const tags = (isFluency ? '<span class="hp-tag tag-fluency" title="Fluency standard">★&#xFE0E;</span>' : '')
             + (group.calc ? '<span class="hp-tag tag-calc" title="Calculator recommended">[calc]</span>' : '');
  const playableVariants = group.variants.filter(v => v.path);
  const hasMultipleVariants = playableVariants.length > 1;
  const isExpanded = _hpFilter.expandedId === group.id && hasMultipleVariants;
  const chevron = hasMultipleVariants
    ? `<svg class="icon hp-card-chevron" aria-hidden="true"><use href="#icon-chevron-right"/></svg>`
    : '';
  const variantList = isExpanded
    ? `<div class="hp-variant-list">${playableVariants.map(v => `
        <button class="hp-variant-btn${v.recommended ? ' recommended' : ''}" data-path="${escHtml(v.path)}" data-gk="${escHtml(gk)}">
          <span class="hp-variant-label">${escHtml(v.label)}</span>
          ${v.recommended ? '<span class="hp-variant-tag">recommended</span>' : ''}
          ${v.calc ? '<span class="hp-tag tag-calc">[calc]</span>' : ''}
        </button>`).join('')}</div>`
    : '';
  return `<div class="hp-set-card${isExpanded ? ' expanded' : ''}" data-id="${escHtml(group.id)}" data-gk="${escHtml(gk)}" role="button" tabindex="0" aria-expanded="${isExpanded}">
    <div class="hp-set-card-header">
      <div class="hp-set-name">${escHtml(group.short)} ${tags}</div>
      ${chevron}
    </div>
    <div class="hp-set-long">${escHtml(group.long)}</div>
    ${stdText ? `<div class="hp-set-std">${escHtml(stdText)}</div>` : ''}
    ${variantList}
  </div>`;
}

// Roadmap overlay — show every topic group with all its grade appearances
function renderRoadmapOverlay() {
  const body = document.getElementById('roadmap-body');
  if (!body) return;

  // Build (gradeKey → groups[]) map
  const byGrade = {};
  TOPIC_GROUPS.forEach(g => {
    Object.keys(g.grades).forEach(gk => {
      (byGrade[gk] = byGrade[gk] || []).push(g);
    });
  });

  body.innerHTML = GRADE_ORDER.filter(gk => byGrade[gk]).map(gk => {
    const rows = byGrade[gk].map(group => {
      const std = topicAllStandards(group, [gk]).join(' · ');
      const isFluency = !!(group.fluency && group.fluency[gk]);
      const tags = (isFluency ? '<span class="hp-tag tag-fluency" title="Fluency standard">★&#xFE0E;</span>' : '')
                 + (group.calc ? '<span class="hp-tag tag-calc" title="Calculator recommended">[calc]</span>' : '');
      const status = topicIsPlayable(group)
        ? '<span class="rm-status rm-ready">Ready</span>'
        : '<span class="rm-status rm-soon">Coming soon</span>';
      const variantsLine = group.variants.length > 1
        ? `<div class="rm-variants">${group.variants.map(v =>
            `<span class="rm-variant${v.path ? ' rm-variant-ready' : ''}">${escHtml(v.label)}</span>`
          ).join(' · ')}</div>`
        : '';
      return `<li class="rm-row${topicIsPlayable(group) ? ' rm-ready-row' : ''}">
        <div class="rm-name-col">
          <div class="rm-name">${escHtml(group.short)} ${tags}</div>
          <div class="rm-long">${escHtml(group.long)}</div>
          ${variantsLine}
        </div>
        <span class="rm-std">${escHtml(std)}</span>
        ${status}
      </li>`;
    }).join('');
    return `<section class="rm-grade">
      <h3 class="rm-grade-title">${escHtml(GRADE_LABELS[gk])}</h3>
      <ul class="rm-list">${rows}</ul>
    </section>`;
  }).join('');
}
function renderPrintView() {
  document.getElementById('pv-title').textContent = state.setName || 'Print Cards';
  applyCardColors();
  const loadErrEl = document.getElementById('pv-load-error');
  if (loadErrEl) loadErrEl.hidden = true;
  // Detect duplicate (column, answer) pairs in loaded data so editor + gates flag them on first render.
  syncProblemsFromEditRows();
  renderPvEditTable();
}

/* ============================================================
   SET EDITOR — always-editable problem table
   ============================================================ */

/** Validate a single editRow in-place, updating row.errors. Returns errors array. */
function validateEditRow(row) {
  const errors = [];
  if (!VALID_COLS.has((row.column || '').toUpperCase())) errors.push('Column must be B, I, N, G, or O');
  if (!(row.problem || '').trim())                       errors.push('Problem is empty');
  const ansStr = (row.answer || '').trim();
  if (ansStr === '')              errors.push('Answer is required');
  else if (isNaN(parseFloat(ansStr))) errors.push('Answer must be a number');
  row.errors = errors;
  return errors;
}

/** Derive state.problems from valid editRows and rebuild columnAnswers. */
function syncProblemsFromEditRows() {
  // 1. Clear stale duplicate errors; basic field errors remain from validateEditRow
  state.editRows.forEach(r => {
    r.errors = r.errors.filter(e => !e.startsWith('Duplicate'));
  });

  // 2. Detect duplicate (column, answer) pairs among otherwise-valid rows
  const answerKeys = {};
  state.editRows.forEach(r => {
    if (r.errors.length > 0) return;
    const key = r.column.toUpperCase() + ':' + parseFloat(r.answer);
    (answerKeys[key] = answerKeys[key] || []).push(r.id);
  });
  Object.values(answerKeys).forEach(ids => {
    if (ids.length > 1) {
      ids.forEach(id => {
        const row = state.editRows.find(r => r.id === id);
        if (row) row.errors.push('Duplicate answer in this column');
      });
    }
  });

  // 3. Refresh DOM for all rows (duplicate errors may have been added or cleared)
  state.editRows.forEach(r => {
    const tr = document.querySelector(`#pv-edit-table tr[data-rowid="${r.id}"]`);
    if (tr) updateEditRowUI(tr, r);
  });

  // 4. Derive valid problems
  state.problems = state.editRows
    .filter(r => r.errors.length === 0)
    .map(r => ({ column: r.column.toUpperCase(), problem: r.problem.trim(), answer: parseFloat(r.answer) }));
  state.columnAnswers = buildColumnAnswers(state.problems);
  updatePvPreviewCount();
}

/** Update the topbar column-count chips and guidance message. */
function updatePvPreviewCount() {
  const el    = document.getElementById('pv-col-counts');
  const msgEl = document.getElementById('pv-topbar-msg');
  if (!el) return;

  const MIN_DISTINCT = 5;
  const REC_DISTINCT = 15;

  // Count valid rows and distinct answers per column
  const colRowCount = { B:0, I:0, N:0, G:0, O:0 };
  const colAnswers  = { B:new Set(), I:new Set(), N:new Set(), G:new Set(), O:new Set() };
  state.editRows.forEach(r => {
    if (r.errors.length > 0) return;
    const c = r.column.toUpperCase();
    if (c in colRowCount) {
      colRowCount[c]++;
      colAnswers[c].add(parseFloat(r.answer));
    }
  });

  const totalValid = Object.values(colRowCount).reduce((a, b) => a + b, 0);

  // Chips — ⚠ when a column has fewer than MIN_DISTINCT distinct answers (and set is non-empty)
  el.innerHTML = BINGO_COLS.map(col => {
    const count    = colRowCount[col];
    const distinct = colAnswers[col].size;
    const warn     = totalValid > 0 && distinct < MIN_DISTINCT;
    const warnIcon = warn ? `<span class="pv-col-warn-icon">${icon('alert-triangle')}</span>` : '';
    return `<span class="pv-col-count${warn ? ' pv-col-warn' : ''}" style="background:var(--col-${col})"><strong>${col}</strong>&thinsp;<span style="font-weight:400">${count}</span>${warnIcon}</span>`;
  }).join('');

  // Inline guidance message
  if (msgEl) {
    if (totalValid === 0) {
      msgEl.textContent = '';
    } else {
      const distinctCounts = BINGO_COLS.map(c => colAnswers[c].size);
      const minDistinct    = Math.min(...distinctCounts);
      const maxDistinct    = Math.max(...distinctCounts);

      if (minDistinct < MIN_DISTINCT) {
        msgEl.textContent = `Bingo cards require at least ${MIN_DISTINCT} different answers per column. ${REC_DISTINCT} answers per column is recommended.`;
      } else if (maxDistinct > REC_DISTINCT) {
        msgEl.textContent = 'Games that exceed 15 answers per column can take a long time to complete.';
      } else {
        msgEl.textContent = '15 answers per column is recommended.';
      }
    }
  }
}

/**
 * Attempt arithmetic auto-check for simple expressions (no LaTeX).
 * Returns 'ok', 'bad', or null (cannot evaluate).
 */
function checkProblemAnswer(problem, answerStr) {
  if (!/^[0-9+\-*\/\(\)\s.]+$/.test(problem || '')) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + problem + ')')();
    if (typeof result !== 'number' || !isFinite(result)) return null;
    return Math.abs(result - parseFloat(answerStr)) < 0.001 ? 'ok' : 'bad';
  } catch { return null; }
}

/** Get the editRow object from a child element of a TR[data-rowid]. */
function getEditRowFromEl(el) {
  const tr = el.closest('tr[data-rowid]');
  if (!tr) return null;
  return state.editRows.find(r => r.id === parseInt(tr.dataset.rowid, 10)) || null;
}

/** Update a single row's UI classes/error list after a data change (no full re-render). */
function updateEditRowUI(tr, row) {
  // Combine validation errors with arithmetic check
  const allErrors = [...row.errors];
  if (row.errors.length === 0 && checkProblemAnswer(row.problem, row.answer) === 'bad') {
    allErrors.push('Answer may be wrong');
  }

  tr.classList.toggle('pv-row-error', allErrors.length > 0);

  const colSel  = tr.querySelector('.pv-col-select');
  const probInp = tr.querySelector('.pv-prob-input');
  const ansInp  = tr.querySelector('.pv-ans-input');

  // Column td background
  if (colSel) {
    const colTd = colSel.closest('td');
    const hasColErr = row.errors.some(e => e.includes('Column'));
    if (colTd) colTd.style.background = hasColErr ? '#c62828' : (COL_COLORS[row.column.toUpperCase()] || '#888');
  }
  if (probInp) probInp.classList.toggle('input-error', allErrors.some(e => e.includes('Problem')));
  if (ansInp)  ansInp.classList.toggle('input-error',  allErrors.some(e => e.includes('Answer')));

  // Error list — update or create the pv-row-errors div in the problem cell
  const probCell = tr.querySelector('td:nth-child(2)');
  if (probCell) {
    let errDiv = probCell.querySelector('.pv-row-errors');
    if (allErrors.length) {
      if (!errDiv) { errDiv = document.createElement('div'); errDiv.className = 'pv-row-errors'; probCell.appendChild(errDiv); }
      errDiv.innerHTML = allErrors.map(e => `<div class="pv-row-error-msg">${escHtml(e)}</div>`).join('');
    } else {
      errDiv?.remove();
    }
  }
}

/** Wire delegated events for the edit table. */
function wirePvEditEvents(tBody, tFoot) {
  // Column select change
  tBody.addEventListener('change', e => {
    const sel = e.target.closest('.pv-col-select');
    if (!sel) return;
    const row = getEditRowFromEl(sel);
    if (!row) return;
    row.column = sel.value;
    validateEditRow(row);
    updateEditRowUI(sel.closest('tr'), row);
    // Update td background to match new column color
    const td = sel.closest('td');
    if (td) td.style.background = (row.errors.some(e => e.includes('Column')) ? '#c62828' : COL_COLORS[sel.value]) || '';
    syncProblemsFromEditRows();
  });

  // Problem input
  tBody.addEventListener('input', e => {
    const inp = e.target.closest('.pv-prob-input');
    if (!inp) return;
    const tr  = inp.closest('tr');
    const row = getEditRowFromEl(inp);
    if (!row) return;
    row.problem = inp.value;
    validateEditRow(row);
    updateEditRowUI(tr, row);
    syncProblemsFromEditRows();
    // Debounced KaTeX preview
    clearTimeout(inp._pvDebounce);
    inp._pvDebounce = setTimeout(() => {
      const previewEl = tr.querySelector('.pv-prob-preview');
      if (!previewEl) return;
      previewEl.innerHTML = '';
      previewEl.classList.remove('preview-error');
      if (inp.value.trim()) {
        try { renderMath(previewEl, inp.value); }
        catch { previewEl.textContent = '⚠ LaTeX error'; previewEl.classList.add('preview-error'); }
      }
    }, 280);
  });

  // Answer input
  tBody.addEventListener('input', e => {
    const inp = e.target.closest('.pv-ans-input');
    if (!inp) return;
    const tr  = inp.closest('tr');
    const row = getEditRowFromEl(inp);
    if (!row) return;
    row.answer = inp.value;
    validateEditRow(row);
    updateEditRowUI(tr, row);
    syncProblemsFromEditRows();
  });

  // Delete row
  tBody.addEventListener('click', e => {
    const btn = e.target.closest('.pv-del-btn');
    if (!btn) return;
    const tr = btn.closest('tr');
    const id = parseInt(tr.dataset.rowid, 10);
    state.editRows = state.editRows.filter(r => r.id !== id);
    tr.remove();
    syncProblemsFromEditRows();
  });

  // Add row
  tFoot.querySelector('#pv-add-row-btn').onclick = () => {
    const newRow = {
      id: newRowId(), column: 'B', problem: '', answer: '',
      errors: ['Problem is empty', 'Answer is required']
    };
    state.editRows.push(newRow);
    renderPvEditTable();
    // Focus the last problem input
    const inputs = document.querySelectorAll('#pv-edit-table .pv-prob-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  };
}

/** Render the always-editable problem table into #pv-problems-table. */
function renderPvEditTable() {
  const container = document.getElementById('pv-problems-table');
  if (!container) return;

  const tBody = document.createElement('tbody');

  state.editRows.forEach(row => {
    const tr = document.createElement('tr');
    tr.dataset.rowid = row.id;

    const colUpper = (row.column || '').toUpperCase();
    const colOptions = BINGO_COLS.map(c =>
      `<option${c === colUpper ? ' selected' : ''}>${c}</option>`).join('');
    // Collect all errors: validation + arithmetic check
    const allErrors = [...row.errors];
    if (row.errors.length === 0 && checkProblemAnswer(row.problem, row.answer) === 'bad') {
      allErrors.push('Answer may be wrong');
    }
    const hasAnsErr = allErrors.some(e => e.includes('Answer'));
    const probErr = allErrors.some(e => e.includes('Problem')) ? ' input-error' : '';
    const ansErr  = hasAnsErr ? ' input-error' : '';
    const errList = allErrors.length
      ? `<div class="pv-row-errors">${allErrors.map(e => `<div class="pv-row-error-msg">${escHtml(e)}</div>`).join('')}</div>`
      : '';

    const hasColErr = row.errors.some(e => e.includes('Column'));
    const colBg = (!hasColErr && COL_COLORS[colUpper]) ? `var(--col-${colUpper})` : '#c62828';
    tr.className = 'pv-edit-row' + (allErrors.length ? ' pv-row-error' : '');
    tr.innerHTML = `
      <td style="background:${colBg};text-align:center;padding:2px 3px;"><select class="pv-col-select">${colOptions}</select></td>
      <td style="min-width:130px">
        <input class="pv-prob-input${probErr}" type="text"
               value="${escHtml(row.problem)}" placeholder="e.g. 2+2 or \\frac{1}{2}">
        <div class="pv-prob-preview"></div>
        ${errList}
      </td>
      <td style="width:100px">
        <input class="pv-ans-input${ansErr}" type="text"
               value="${escHtml(row.answer)}" placeholder="e.g. 4">
      </td>
      <td style="width:30px;text-align:center">
        <button class="pv-del-btn icon-btn" title="Delete row" aria-label="Delete row">${icon('x')}</button>
      </td>`;

    // Render initial KaTeX preview
    const previewEl = tr.querySelector('.pv-prob-preview');
    if (previewEl && (row.problem || '').trim()) {
      try { renderMath(previewEl, row.problem); }
      catch { previewEl.textContent = '⚠ LaTeX error'; previewEl.classList.add('preview-error'); }
    }

    tBody.appendChild(tr);
  });

  // Footer row with "Add Row" button
  const tFoot = document.createElement('tfoot');
  tFoot.innerHTML = `<tr id="pv-add-row-row"><td colspan="4">
    <button class="hp-btn" id="pv-add-row-btn">+ Add PROBLEM</button>
  </td></tr>`;

  const table = document.createElement('table');
  table.id = 'pv-edit-table';
  table.innerHTML = `<thead><tr>
    <th style="width:56px">Col</th>
    <th>Problem (LaTeX or plain text)</th>
    <th style="width:100px">Answer</th>
    <th style="width:30px"></th>
  </tr></thead>`;
  table.appendChild(tBody);
  table.appendChild(tFoot);

  container.innerHTML = '';
  container.appendChild(table);

  wirePvEditEvents(tBody, tFoot);
  updatePvPreviewCount();
}

function pvSaveSetCsv() {
  if (state.editRows.length === 0) { showNotification(['No rows to save.'], 'error'); return; }
  const lines = ['column,problem,answer'];
  state.editRows.forEach(r => {
    // Quote fields that contain commas or quotes
    const q = s => /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    lines.push(`${q(r.column)},${q(r.problem)},${q(r.answer)}`);
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const name = (state.setName || 'bingo-set').replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '-') || 'bingo-set';
  Object.assign(document.createElement('a'), { href: url, download: name + '.csv' }).click();
  URL.revokeObjectURL(url);
}

function downloadTemplate() {
  const a = Object.assign(document.createElement('a'), {
    href: 'sets/bingo-template.csv',
    download: 'bingo-template.csv',
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ============================================================
   AUTO-ADVANCE TIMER
   ============================================================ */
let rafId = null;
let _lastRenderedIndex = -1;

// Centralized reset for per-game render-state trackers.
// Call when loading a new set, resetting the game, or otherwise wiping history.
function resetRenderState() {
  _lastRenderedIndex = -1;
  _lastAnimatedKey   = null;
  _lastTickSec       = null;
}
let _resizeDebounceTimer = null;
let timerEnd = null;
let timerPaused = false;
let timerRemainingMs = null;
let _lastTickSec = null; // gate so each integer second only emits one tick
const timerIntervalMs = () => state.settings.autoAdvanceInterval * 1000;

function startTimer() {
  stopTimer();
  if (!state.settings.autoAdvanceOn || state.gameOver) return;
  timerEnd = Date.now() + timerIntervalMs();
  timerPaused = false;
  timerRemainingMs = null;
  _lastTickSec = null;
  tickTimer();
}

function pauseTimer() {
  if (!timerEnd && !timerPaused) return;
  const fillEl = document.getElementById('timer-fill');
  if (timerPaused) {
    // resume
    timerEnd = Date.now() + timerRemainingMs;
    timerPaused = false;
    timerRemainingMs = null;
    if (fillEl) fillEl.classList.remove('paused');
    tickTimer();
  } else {
    // pause
    timerRemainingMs = Math.max(0, timerEnd - Date.now());
    timerPaused = true;
    if (fillEl) fillEl.classList.add('paused');
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }
  updateTimerDisplay();
}

function stopTimer() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  audio.stopTick();
  timerEnd = null;
  timerPaused = false;
  timerRemainingMs = null;
  _lastTickSec = null;
  const fillEl = document.getElementById('timer-fill');
  if (fillEl) fillEl.classList.remove('paused');
}

function tickTimer() {
  if (timerPaused) return;
  const remaining = timerEnd - Date.now();
  // Tick sound during the last 3 whole seconds (one per integer second).
  const sec = Math.ceil(remaining / 1000);
  if (sec > 0 && sec <= 3 && sec !== _lastTickSec) {
    _lastTickSec = sec;
    audio.play('tick');
  }
  if (remaining <= 0) {
    stopTimer();
    nextProblem();
    render();
    if (state.settings.autoAdvanceOn && !state.gameOver) startTimer();
    return;
  }
  updateTimerDisplay(remaining);
  rafId = requestAnimationFrame(tickTimer);
}

function updateTimerDisplay(remaining) {
  const container = document.getElementById('timer-container');
  if (!state.settings.autoAdvanceOn || !timerEnd && !timerPaused) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const total = timerIntervalMs();
  const rem = remaining !== undefined ? remaining : (timerPaused ? timerRemainingMs : Math.max(0, timerEnd - Date.now()));
  const pct = Math.max(0, Math.min(100, (rem / total) * 100));
  document.getElementById('timer-fill').style.width = pct + '%';
  const secs = Math.ceil(rem / 1000);
  const label = timerPaused ? `${secs}s (paused)` : `${secs}s`;
  document.getElementById('timer-label').textContent = label;
}

/* ============================================================
   FONT AUTO-FIT
   ============================================================ */
// 20 iterations on a [16, 800] range narrows the binary search to ~1px,
// which is finer than display rounding. Increase only if the range widens.
const FONT_SIZE_BINARY_SEARCH_ITERATIONS = 20;

function computeProblemFontSize() {
  if (!state.problems || state.problems.length === 0) return;
  const problemArea = document.getElementById('problem-area');
  if (!problemArea || problemArea.offsetWidth === 0) return;

  const longestProblem = state.problems.reduce(
    (best, p) => p.problem.length > best.length ? p.problem : best, ''
  );

  // Mirror CSS: #problem-card { max-width: clamp(700px, 70vw, 1400px) }
  // Card may be hidden (offsetWidth=0) when this runs before render(), so compute directly.
  const cardMaxW = Math.min(Math.max(700, window.innerWidth * 0.7), 1400);
  const availW = Math.min(problemArea.offsetWidth - 40, cardMaxW - 40);
  // Total height minus #problem-area padding (20px × 2).
  // For each candidate font size, the chip takes 1.3× that size + 16px gap,
  // leaving the rest for the equation text (measured via the probe element).
  const totalH = problemArea.offsetHeight - 40;
  if (availW <= 0 || totalH <= 0) return;

  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-weight:700;line-height:1.1;letter-spacing:-0.01em;top:-9999px;left:-9999px;';
  if (longestProblem.includes('\\') && typeof katex !== 'undefined') {
    try { probe.innerHTML = katex.renderToString(longestProblem, { throwOnError: false, displayMode: false }); }
    catch(e) { probe.textContent = longestProblem; }
  } else {
    probe.textContent = longestProblem;
  }
  document.body.appendChild(probe);

  let lo = 16, hi = 800, best = lo;
  for (let i = 0; i < FONT_SIZE_BINARY_SEARCH_ITERATIONS; i++) {
    const mid = Math.floor((lo + hi) / 2);
    probe.style.fontSize = mid + 'px';
    // Chip font = 50% of equation font; circle diameter = 0.5 × 1.3 × mid = 0.65 × mid.
    // +14px safety margin absorbs sub-pixel rounding between the probe and the live element.
    const maxEquH = Math.max(16, totalH - mid * 0.65 - 16 - 14);
    if (probe.offsetWidth <= availW && probe.offsetHeight <= maxEquH) {
      best = mid; lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  document.body.removeChild(probe);
  document.documentElement.style.setProperty('--problem-font-size', best + 'px');
}

/* ============================================================
   FORMAT HELPERS
   ============================================================ */
const DEFAULT_COL_COLORS = { B: '#1565c0', I: '#2e7d32', N: '#e65100', G: '#6a1b9a', O: '#b71c1c' };
let COL_COLORS = { ...DEFAULT_COL_COLORS };

function applyCardColors() {
  const colors = state.settings.cardColors;
  Object.assign(COL_COLORS, colors);
  BINGO_COLS.forEach(col => {
    document.documentElement.style.setProperty(`--col-${col}`, colors[col]);
    const input = document.getElementById(`pv-color-${col}`);
    if (input) input.value = colors[col];
    const badge = document.querySelector(`.pv-color-row[data-col="${col}"] .pv-color-col-label`);
    if (badge) badge.style.background = colors[col];
    // Show reset button only when color differs from default
    const resetBtn = document.querySelector(`.pv-color-row[data-col="${col}"] .pv-color-reset`);
    if (resetBtn) resetBtn.hidden = (colors[col] === DEFAULT_COL_COLORS[col]);
  });
  updateWorkThumb();
}

function applyFont() {
  const cfg = FONT_OPTIONS[state.settings.font] || FONT_OPTIONS.default;
  document.documentElement.style.setProperty('--app-font', cfg.cssStack);
}

// Populate a <select> with FONT_OPTIONS, styling each option in its own font.
function populateFontSelect(sel) {
  sel.innerHTML = '';
  sel.dataset.fontSelect = '';
  Object.entries(FONT_OPTIONS).forEach(([key, cfg]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = cfg.label;
    opt.style.fontFamily = cfg.cssStack;
    sel.appendChild(opt);
  });
  sel.value = state.settings.font;
  sel.style.fontFamily = FONT_OPTIONS[state.settings.font].cssStack;
}

// Apply a font choice + sync every font-select in the DOM (settings panel + print view).
function setFont(key) {
  state.settings.font = key;
  saveSettings();
  applyFont();
  const cfg = FONT_OPTIONS[key] || FONT_OPTIONS.default;
  document.querySelectorAll('[data-font-select]').forEach(sel => {
    sel.value = key;
    sel.style.fontFamily = cfg.cssStack;
  });
}

// Cache value is a Promise resolving to { normal: b64, bold?: b64 }.
// Storing the Promise itself lets concurrent callers await the same in-flight fetch
// instead of triggering parallel network requests for the same TTF.
const _pdfFontCache = new Map();

async function ensurePdfFont(doc, fontKey) {
  const cfg = FONT_OPTIONS[fontKey] || FONT_OPTIONS.default;
  if (!cfg.pdfUrls) return cfg.pdfName;  // built-in helvetica — nothing to load

  if (!_pdfFontCache.has(fontKey)) {
    _pdfFontCache.set(fontKey, (async () => {
      const buffers = {};
      for (const [style, url] of Object.entries(cfg.pdfUrls)) {
        const buf = await fetch(url).then(r => {
          if (!r.ok) throw new Error(`Failed to load ${cfg.label} (${style})`);
          return r.arrayBuffer();
        });
        // Chunked base64 to avoid call-stack overflow on large buffers
        const bytes = new Uint8Array(buf);
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        buffers[style] = btoa(bin);
      }
      return buffers;
    })().catch(err => {
      // Don't poison the cache on failure — drop the entry so a retry can run.
      _pdfFontCache.delete(fontKey);
      throw err;
    }));
  }

  const buffers  = await _pdfFontCache.get(fontKey);
  const normalB64 = buffers.normal;
  const boldB64   = buffers.bold || buffers.normal;  // single-weight fonts alias normal→bold
  doc.addFileToVFS(`${cfg.pdfName}-Regular.ttf`, normalB64);
  doc.addFont(`${cfg.pdfName}-Regular.ttf`, cfg.pdfName, 'normal');
  doc.addFileToVFS(`${cfg.pdfName}-Bold.ttf`, boldB64);
  doc.addFont(`${cfg.pdfName}-Bold.ttf`, cfg.pdfName, 'bold');
  return cfg.pdfName;
}

/* ============================================================
   RENDER
   ============================================================ */
function render() {
  applySettings();
  renderProgress();
  renderBoard();
  renderProblem();
  updateTimerDisplay();
}

function applySettings() {
  const s = state.settings;
  // Theme: 'auto' clears data-theme so the prefers-color-scheme media query
  // takes over; 'light' / 'dark' set it explicitly. (See shared/desk.css.)
  sharedStorage.applyTheme(s.theme);
  document.documentElement.style.setProperty('--rbs', s.recentBallScale ?? 1.0);
  document.getElementById('bottom-nav').hidden = !s.showNavButtons;
  const isRecent = s.boardMode === 'recent';
  const panelVisible = isRecent ? (s.showBoard && s.showRecentBalls) : s.showBoard;
  document.getElementById('board-panel').classList.toggle('hidden', !panelVisible);
  document.getElementById('board-grid').classList.toggle('mode-hidden', isRecent);
  document.getElementById('recent-balls-strip').classList.toggle('mode-hidden', !isRecent);
}

function renderProgress() {
  const el = document.getElementById('progress-display');
  if (!state.settings.showProgress) { el.textContent = ''; return; }
  const p = currentProblem();
  if (!p) { el.textContent = `${state.problems.length} problems loaded`; return; }

  const calledCount = Object.values(state.calledAnswers).reduce((s, set) => s + set.size, 0);
  const totalAnswers = Object.values(state.columnAnswers).reduce((s, arr) => s + arr.length, 0);
  const remaining = totalAnswers - calledCount;
  el.textContent = `${calledCount} of ${totalAnswers} called • ${remaining} remaining`;
}

function renderBoard() {
  if (state.settings.boardMode === 'recent') {
    renderRecentBalls();
  } else {
    renderBoardGrid();
  }
}

function createBallCardEl(p) {
  const showAnswer = state.settings.boardContent === 'answers';
  const card = document.createElement('div');
  card.className = 'recent-ball-card';
  const circle = document.createElement('div');
  circle.className = 'recent-ball-circle';
  circle.setAttribute('data-col', p.column);
  circle.textContent = p.column;
  const label = document.createElement('div');
  label.className = 'recent-ball-label';
  renderMath(label, showAnswer ? String(p.answer) : p.problem);
  card.appendChild(circle);
  card.appendChild(label);
  return card;
}

// Tracks the most recently animated problem so settings re-renders, replays,
// and idempotent renders don't retrigger the chip-drop animation.
let _lastAnimatedKey = null;

// Row ID counter for the set editor (increments forever; never reused).
let _nextRowId = 1;
function newRowId() { return _nextRowId++; }

function triggerBallAnimation(chip, textEl, variant) {
  // Cancel any in-flight animation so rapid Next presses restart cleanly.
  chip.classList.remove('chip-anim-drop','chip-anim-pop','chip-anim-roll');
  textEl.classList.remove('text-anim-rise');
  // Force reflow so re-adding the class restarts at 0%.
  void chip.offsetWidth;
  // Apply duration from audio file metadata (auto-updated on loadedmetadata).
  const dur = ANIM_DURATIONS[variant];
  if (dur) {
    chip.style.animationDuration = dur + 's';
    // Text rise: proportional to chip duration (delay ≈30%, duration ≈56%)
    textEl.style.animationDelay    = (dur * 0.30).toFixed(3) + 's';
    textEl.style.animationDuration = (dur * 0.56).toFixed(3) + 's';
  }
  chip.classList.add('chip-anim-' + variant);
  textEl.classList.add('text-anim-rise');
}

function renderRecentBalls() {
  const strip = document.getElementById('recent-balls-strip');
  const n = state.settings.recentCount;
  const ci = state.currentIndex;
  const isNewCall = ci > _lastRenderedIndex && ci >= 0;
  _lastRenderedIndex = ci;

  const visible = ci > 0
    ? state.history.slice(Math.max(0, ci - n), ci)
    : [];

  if (!isNewCall || strip.children.length === 0) {
    strip.innerHTML = '';
    [...visible].reverse().forEach(p => strip.appendChild(createBallCardEl(p)));
    return;
  }

  const willOverflow = strip.children.length >= n;
  const allExisting  = [...strip.children];
  const exiting      = willOverflow ? allExisting[allExisting.length - 1] : null;

  // Pull exiting card out of flex flow NOW so it doesn't affect layout
  // during FLIP measurement — removing it later won't cause any reflow
  if (exiting) {
    const er = exiting.getBoundingClientRect();
    const sr = strip.getBoundingClientRect();
    Object.assign(exiting.style, {
      position: 'absolute',
      left: (er.left - sr.left) + 'px',
      top:  (er.top  - sr.top)  + 'px',
      width: er.width + 'px',
      margin: '0',
      pointerEvents: 'none',
    });
  }

  const staying = allExisting.filter(c => c !== exiting);

  // FLIP step 1: record positions now that exiting is out of flow
  const firstLefts = staying.map(c => c.getBoundingClientRect().left);

  // Insert new card at left, invisible
  const newCard = createBallCardEl(visible[visible.length - 1]);
  Object.assign(newCard.style, { opacity: '0', transform: 'translateX(-70px) scale(0.78)', transition: 'none' });
  strip.prepend(newCard);

  // FLIP step 2: measure shifted positions, apply inverse transforms
  staying.forEach((card, i) => {
    const dx = firstLefts[i] - card.getBoundingClientRect().left;
    card.style.transition = 'none';
    card.style.transform = `translateX(${dx}px)`;
  });

  // Force reflow
  strip.offsetWidth;

  // FLIP step 3: play — all staying cards slide smoothly, new card springs in
  requestAnimationFrame(() => {
    const slide = 'transform 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    staying.forEach(c => { c.style.transition = slide; c.style.transform = ''; });
    Object.assign(newCard.style, {
      transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
      transform: '', opacity: '1',
    });

    // Fade out the absolutely-positioned exiting card, then remove it
    // Since it's out of flex flow, its removal causes zero layout shift
    if (exiting) {
      Object.assign(exiting.style, {
        transition: 'transform 0.42s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.32s ease',
        transform: 'translateX(90px) scale(0.78)',
        opacity: '0',
      });
      setTimeout(() => exiting.remove(), 450);
    }
  });
}

function renderBoardGrid() {
  const grid = document.getElementById('board-grid');
  const cols = BINGO_COLS.filter(c => state.columnAnswers[c]);
  if (cols.length === 0) { grid.innerHTML = ''; return; }

  const showProblems = state.settings.boardContent === 'problems';

  // Build a map from (col, answer) → problem text for the called entries
  const calledProblemMap = {};
  for (const p of state.history) {
    const key = `${p.column}:${p.answer}`;
    if (!calledProblemMap[key]) calledProblemMap[key] = p.problem;
  }

  grid.innerHTML = cols.map(col => {
    const answers = state.columnAnswers[col];
    const called = state.calledAnswers[col] || new Set();

    if (called.size === 0) return '';

    const cells = answers.map(a => {
      if (!called.has(a)) return '';
      const key = `${col}:${a}`;
      const label = showProblems ? (calledProblemMap[key] || String(a)) : String(a);
      const labelHtml = label.includes('\\') && typeof katex !== 'undefined'
        ? katex.renderToString(label, { throwOnError: false, displayMode: false })
        : escHtml(label);
      return `<div class="board-cell called" style="background:var(--col-${col})" title="${col} ${a}">${labelHtml}</div>`;
    }).join('');

    return `<div class="board-col">
      <div class="board-col-header" style="background:var(--col-${col})">${col}</div>
      ${cells}
    </div>`;
  }).join('');
}

function renderProblem() {
  const p = currentProblem();
  const startPrompt = document.getElementById('start-prompt');
  const card = document.getElementById('problem-card');

  if (!p) {
    startPrompt.hidden = false;
    card.hidden = true;
    document.getElementById('btn-prev').disabled = true;
    document.getElementById('btn-next').disabled = false;
    return;
  }

  startPrompt.hidden = true;
  card.hidden = false;
  card.classList.toggle('replay', isReplay());

  // Replay badge
  document.getElementById('replay-badge').hidden = !isReplay();

  // Column chip
  const chip = document.getElementById('col-chip');
  const problemTextEl = document.getElementById('problem-text');
  chip.hidden = !state.settings.showColumn;
  if (state.settings.showColumn) {
    chip.textContent = p.column;
    chip.setAttribute('data-col', p.column);
  }

  // Problem text
  renderMath(problemTextEl, p.problem);

  // Animate the ball + play sound only on a genuinely new arrival
  // (not replays or settings re-renders). Animation skips if user picked 'none'.
  const animKey = state.currentIndex + ':' + p.column + ':' + p.problem;
  const isFreshArrival = !isReplay() && animKey !== _lastAnimatedKey;
  if (isFreshArrival) {
    const variant = state.settings.ballAnimation;
    if (variant && variant !== 'none') {
      triggerBallAnimation(chip, problemTextEl, variant);
    }
    audio.play('ballDrop');
    _lastAnimatedKey = animKey;
  }

  // Answer section
  const answerReveal = document.getElementById('answer-reveal');
  answerReveal.hidden = !state.answerVisible;
  if (state.answerVisible) {
    const valEl = document.getElementById('answer-value');
    renderMath(valEl, String(p.answer));
    valEl.setAttribute('data-col', p.column);
  }

  // Game over message
  document.getElementById('game-over-msg').hidden = !state.gameOver;

  // Nav buttons
  document.getElementById('btn-prev').disabled = state.currentIndex <= 0;
  document.getElementById('btn-next').disabled = !canGoNext();
}

/* ============================================================
   SETTINGS PANEL RENDER
   ============================================================ */
function renderSettings() {
  const s = state.settings;
  const ca = state.columnAnswers;
  const colCounts = BINGO_COLS
    .filter(c => ca[c])
    .map(c => `${c}: ${ca[c].length}`)
    .join(' · ');
  const totalProblems = state.problems.length;

  document.getElementById('settings-body').innerHTML = `
    <div class="settings-section">
      <span class="settings-label">Auto-Advance Timer</span>
      <div class="settings-row">
        <label for="s-auto-on">Enable auto-advance</label>
        <input type="checkbox" id="s-auto-on" ${s.autoAdvanceOn ? 'checked' : ''}>
      </div>
      <div class="settings-row">
        <label for="s-auto-interval">Interval</label>
        <select id="s-auto-interval">
          ${[10,20,30,45,60].map(v => `<option value="${v}" ${s.autoAdvanceInterval===v?'selected':''}>${v} seconds</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-label">Display</span>
      <div class="settings-row">
        <label for="s-show-col">Show column letter (B/I/N/G/O)</label>
        <input type="checkbox" id="s-show-col" ${s.showColumn ? 'checked' : ''}>
      </div>
      <div class="settings-row">
        <label for="s-show-nav">Show Next / Check Answer / Back buttons</label>
        <input type="checkbox" id="s-show-nav" ${s.showNavButtons ? 'checked' : ''}>
      </div>
      <div class="settings-row">
        <label for="s-show-progress">Show call count</label>
        <input type="checkbox" id="s-show-progress" ${s.showProgress ? 'checked' : ''}>
      </div>
      <div class="settings-row">
        <label for="s-show-recent">Show recently called numbers</label>
        <input type="checkbox" id="s-show-recent" ${s.showRecentBalls ? 'checked' : ''}>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-label">Animation &amp; Sound</span>
      <div class="settings-row">
        <label for="s-ball-anim">Ball entrance</label>
        <select id="s-ball-anim">
          <option value="drop"${s.ballAnimation==='drop'?' selected':''}>Drop &amp; bounce</option>
          <option value="pop"${s.ballAnimation==='pop'?' selected':''}>Pop spring</option>
          <option value="roll"${s.ballAnimation==='roll'?' selected':''}>Roll-in</option>
          <option value="none"${s.ballAnimation==='none'?' selected':''}>None</option>
        </select>
      </div>
      <div class="settings-row">
        <label for="s-sound-enabled">Enable sound effects</label>
        <input type="checkbox" id="s-sound-enabled" ${s.soundEnabled ? 'checked' : ''}>
      </div>
      <div class="settings-row" id="s-sound-vol-row"${s.soundEnabled ? '' : ' hidden'}>
        <label for="s-sound-volume">Volume</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="range" id="s-sound-volume" min="0" max="1" step="0.05"
                 value="${s.soundVolume}" style="width:90px;accent-color:var(--primary)">
          <span id="s-sound-volume-val" style="min-width:38px;text-align:right;font-weight:700;">${Math.round(s.soundVolume*100)}%</span>
        </div>
      </div>
      <div class="settings-row">
        <label for="s-sound-tick">Tick sound (last 3s of auto-advance)</label>
        <input type="checkbox" id="s-sound-tick" ${s.soundTick ? 'checked' : ''}>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-label">Called Numbers Board <kbd>B</kbd></span>
      <div class="settings-row">
        <label for="s-show-board">Show board</label>
        <input type="checkbox" id="s-show-board" ${s.showBoard ? 'checked' : ''}>
      </div>
      <div class="settings-row">
        <label>Board style <kbd>K</kbd></label>
        <div class="seg-group">
          <button class="seg-btn${s.boardMode==='recent'?' active':''}" data-board-mode="recent">Recent Balls</button>
          <button class="seg-btn${s.boardMode==='grid'?' active':''}" data-board-mode="grid">Grid</button>
        </div>
      </div>
      <div class="settings-row" id="s-recent-count-row"${s.boardMode==='recent'?'':' hidden'}>
        <label>Show last N balls</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="icon-btn" id="s-recent-dec">−</button>
          <span id="s-recent-val" style="min-width:24px;text-align:center;font-weight:700;">${s.recentCount}</span>
          <button class="icon-btn" id="s-recent-inc">+</button>
        </div>
      </div>
      <div class="settings-row" id="s-rbs-row"${s.boardMode==='recent'?'':' hidden'}>
        <label for="s-rbs-slider">Recent numbers size</label>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="range" id="s-rbs-slider" min="0.5" max="2.5" step="0.1"
            value="${s.recentBallScale ?? 1.5}" style="width:90px;accent-color:var(--primary)">
          <span id="s-rbs-val" style="min-width:34px;text-align:right;font-weight:700;">${Math.round((s.recentBallScale ?? 1.5) * 100)}%</span>
        </div>
      </div>
      <div class="settings-row">
        <label>Board shows</label>
        <div class="seg-group">
          <button class="seg-btn${s.boardContent==='problems'?' active':''}" data-board-content="problems">Problems</button>
          <button class="seg-btn${s.boardContent==='answers'?' active':''}" data-board-content="answers">Answers</button>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-label">Font</span>
      <div class="settings-row">
        <label for="s-font">Family</label>
        <select id="s-font"></select>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-label">Theme</span>
      <div class="seg-group">
        <button class="seg-btn${s.theme==='auto'||!s.theme?' active':''}" data-theme-val="auto">Auto</button>
        <button class="seg-btn${s.theme==='light'?' active':''}" data-theme-val="light">Light</button>
        <button class="seg-btn${s.theme==='dark'?' active':''}" data-theme-val="dark">Dark</button>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-label">Classroom data</span>
      <div class="file-info" style="margin-bottom:10px">
        Save your sets, settings, and other Teacher's Desk data as a single JSON file —
        or import a previously-saved file to restore everything.
      </div>
      <div class="settings-row" style="gap:8px;flex-wrap:wrap">
        <button class="hp-btn"         id="settings-export">Export classroom</button>
        <button class="hp-btn" id="settings-import">Import classroom…</button>
      </div>
    </div>

    <div class="settings-section">
      <span class="settings-label">Game</span>
      <button class="btn-danger" id="settings-reset">Reset Game</button>
    </div>

  `;

  // Wire settings panel events
  const sBody = document.getElementById('settings-body');
  document.getElementById('s-auto-on').onchange = e => {
    state.settings.autoAdvanceOn = e.target.checked;
    saveSettings();
    if (!e.target.checked) stopTimer();
    else if (currentProblem()) startTimer();
    render();
  };
  document.getElementById('s-auto-interval').onchange = e => {
    state.settings.autoAdvanceInterval = parseInt(e.target.value, 10);
    saveSettings();
    if (state.settings.autoAdvanceOn && currentProblem()) { stopTimer(); startTimer(); }
    render();
  };
  document.getElementById('s-show-col').onchange = e => {
    state.settings.showColumn = e.target.checked;
    saveSettings(); render();
  };
  document.getElementById('s-show-nav').onchange = e => {
    state.settings.showNavButtons = e.target.checked;
    saveSettings(); render();
  };
  document.getElementById('s-show-progress').onchange = e => {
    state.settings.showProgress = e.target.checked;
    saveSettings(); render();
  };
  document.getElementById('s-show-recent').onchange = e => {
    state.settings.showRecentBalls = e.target.checked;
    saveSettings(); render();
  };
  document.getElementById('s-show-board').onchange = e => {
    state.settings.showBoard = e.target.checked;
    saveSettings(); render();
  };
  sBody.querySelectorAll('[data-board-mode]').forEach(btn => {
    btn.onclick = () => {
      state.settings.boardMode = btn.dataset.boardMode;
      _lastRenderedIndex = -1; // force a fresh static render of the strip
      saveSettings(); renderSettings(); render();
    };
  });
  const recentDec = sBody.querySelector('#s-recent-dec');
  if (recentDec) {
    recentDec.onclick = () => {
      if (state.settings.recentCount > 1) {
        state.settings.recentCount--;
        saveSettings();
        sBody.querySelector('#s-recent-val').textContent = state.settings.recentCount;
        render();
      }
    };
    sBody.querySelector('#s-recent-inc').onclick = () => {
      if (state.settings.recentCount < 10) {
        state.settings.recentCount++;
        saveSettings();
        sBody.querySelector('#s-recent-val').textContent = state.settings.recentCount;
        render();
      }
    };
  }
  sBody.querySelectorAll('[data-board-content]').forEach(btn => {
    btn.onclick = () => {
      state.settings.boardContent = btn.dataset.boardContent;
      saveSettings(); renderSettings(); render();
    };
  });
  const rbsSlider = sBody.querySelector('#s-rbs-slider');
  if (rbsSlider) {
    rbsSlider.oninput = () => {
      state.settings.recentBallScale = parseFloat(rbsSlider.value);
      sBody.querySelector('#s-rbs-val').textContent = Math.round(state.settings.recentBallScale * 100) + '%';
      applySettings();
      saveSettings();
    };
  }

  // Animation & Sound handlers
  sBody.querySelector('#s-ball-anim').onchange = e => {
    state.settings.ballAnimation = e.target.value;
    saveSettings();
  };
  sBody.querySelector('#s-sound-enabled').onchange = e => {
    state.settings.soundEnabled = e.target.checked;
    saveSettings();
    // Show/hide dependent rows
    const volRow = document.getElementById('s-sound-vol-row');
    if (volRow) volRow.hidden = !state.settings.soundEnabled;
  };
  const volSlider = sBody.querySelector('#s-sound-volume');
  if (volSlider) {
    volSlider.oninput = () => {
      state.settings.soundVolume = parseFloat(volSlider.value);
      sBody.querySelector('#s-sound-volume-val').textContent =
        Math.round(state.settings.soundVolume * 100) + '%';
      audio.setVolume();
      saveSettings();
    };
  }
  sBody.querySelector('#s-sound-tick').onchange = e => {
    state.settings.soundTick = e.target.checked;
    saveSettings();
  };
  const sFont = sBody.querySelector('#s-font');
  if (sFont) {
    populateFontSelect(sFont);
    sFont.onchange = e => setFont(e.target.value);
  }
  sBody.querySelectorAll('[data-theme-val]').forEach(btn => {
    btn.onclick = () => {
      const v = btn.dataset.themeVal;
      state.settings.theme = v;
      // setTheme persists to suite preferences, applies the data-theme
      // attribute, and dispatches a 'themechange' event for any non-CSS
      // listeners (Konva in the seating chart). saveSettings() also writes
      // the suite-wide preference, but setTheme handles the apply + event.
      sharedStorage.setTheme(v);
      saveSettings(); renderSettings(); render();
    };
  });
  document.getElementById('settings-reset').onclick = () => {
    closeOverlay('settings-overlay');
    showConfirm();
  };
  document.getElementById('settings-export').onclick = () => {
    triggerClassroomExport();
  };
  document.getElementById('settings-import').onclick = () => {
    closeOverlay('settings-overlay');
    triggerClassroomImport();
  };
}

/* ============================================================
   BINGO CARD GENERATION
   ============================================================ */
function generateBingoCards(n) {
  const cols = BINGO_COLS;
  return Array.from({ length: n }, () =>
    cols.map((col, ci) => {
      const pool = [...(state.columnAnswers[col] || [])];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const five = pool.slice(0, 5);
      if (ci === 2) five[2] = null; // FREE center
      return five;
    })
  );
}

async function pvDownloadCards() {
  // Re-entry guard — async work should never overlap with itself.
  if (pvDownloadCards._busy) return;
  const n        = parseInt(document.getElementById('pv-count').value, 10);
  const style    = document.querySelector('.pv-style-card.active')?.dataset.pvStyle || 'full';
  const color    = document.querySelector('[data-pv-color].active')?.dataset.pvColor !== 'bw';
  const showNums = document.getElementById('pv-show-numbers')?.checked ?? true;
  const workType = document.querySelector('[data-pv-work].active')?.dataset.pvWork || 'lined';
  const errEl    = document.getElementById('pv-dl-error');
  errEl.hidden   = true;

  if (isNaN(n) || n < 1) {
    errEl.textContent = 'Enter a valid card count (1\u2013200).'; errEl.hidden = false; return;
  }
  const thinCols = BINGO_COLS.filter(c => (state.columnAnswers[c] || []).length < 5);
  if (thinCols.length) {
    errEl.textContent = `Not enough answers in columns: ${thinCols.join(', ')} (need \u2265 5 each).`;
    errEl.hidden = false; return;
  }
  // Duplicate-answer gate: each (column, answer) pair must be unique within its column.
  const seenInCol = {};
  const dupCols = new Set();
  for (const p of state.problems) {
    const key = p.column + ':' + p.answer;
    if (seenInCol[key]) dupCols.add(p.column);
    seenInCol[key] = true;
  }
  if (dupCols.size) {
    errEl.textContent = `Duplicate answers in column${dupCols.size > 1 ? 's' : ''} ${[...dupCols].sort().join(', ')}. Each column must have unique answers \u2014 fix in the editor before downloading.`;
    errEl.hidden = false; return;
  }
  if (typeof jspdf === 'undefined') {
    errEl.textContent = 'PDF library not loaded yet \u2014 please try again in a moment.';
    errEl.hidden = false; return;
  }

  const callerSheet  = document.getElementById('pv-caller-sheet')?.checked ?? true;
  const lineSpacing  = parseFloat(document.getElementById('pv-work-scale')?.value ?? 7);
  const cards = generateBingoCards(n);
  // Mark busy + show progress on the button so the user knows the PDF is being built
  // (CDN font fetch + jsPDF render can take ~50–500ms on first use).
  pvDownloadCards._busy = true;
  const btn = document.getElementById('pv-download-btn');
  const origLabel = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-download"/></svg> Generating PDF…';
  }
  try {
    await generateCardsPDF(cards, { style, color, showCardNumbers: showNums, workType, callerSheet, lineSpacing, fontKey: state.settings.font });
  } catch (e) {
    errEl.textContent = `Could not generate PDF: ${e.message || e}`;
    errEl.hidden = false;
  } finally {
    pvDownloadCards._busy = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origLabel;
    }
  }
}

function updateWorkPreview() {
  const canvas = document.getElementById('pv-work-preview');
  if (!canvas) return;
  const workType = document.querySelector('[data-pv-work].active')?.dataset.pvWork || 'lined';
  const spacing  = parseFloat(document.getElementById('pv-work-scale')?.value ?? 7);
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (workType === 'blank') return;
  const px = spacing * (H / 30); // scale so ~4 lines fill the preview at default 7mm
  ctx.strokeStyle = '#c8c8c8';
  ctx.lineWidth = 0.9;
  for (let y = px; y < H; y += px) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  if (workType === 'grid') {
    for (let x = px; x < W; x += px) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }
  updateWorkThumb();
}

function updateWorkThumb() {
  const canvas = document.getElementById('pv-work-thumb');
  if (!canvas) return;

  // Draw at 4× for sharpness on zoom; CSS width/height via .pv-style-thumb stays 54×42
  const LW = 54, LH = 42, DPR = 4;
  canvas.width  = LW * DPR;
  canvas.height = LH * DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, LW, LH);

  const workType = document.querySelector('[data-pv-work].active')?.dataset.pvWork || 'lined';
  const spacing  = parseFloat(document.getElementById('pv-work-scale')?.value ?? 7);

  const COL_COLORS_THUMB = BINGO_COLS.map(c => COL_COLORS[c]);

  ctx.clearRect(0, 0, LW, LH);

  // Work-area line pixel spacing: map real mm to thumbnail pixels
  // At 3mm → ~1.8px apart (fine); at 15mm → ~5.5px apart (wide)
  const linePx = 1.8 + (spacing - 3) / (15 - 3) * (5.5 - 1.8);

  // ── Left: one bingo card (matches Half Page SVG proportions, square cells) ──
  const cx = 2, cy = 7, CW = 22;
  const HEADER_H = 5;
  const colW = CW / 5;               // 4.4
  const CH = HEADER_H + 5 * colW;   // 5 + 22 = 27

  // Card background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx, cy, CW, CH);
  // BINGO header
  COL_COLORS_THUMB.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(cx + i * colW, cy, colW, HEADER_H);
  });
  // Vertical grid lines
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 0.4;
  for (let i = 1; i < 5; i++) {
    const x = cx + i * colW;
    ctx.beginPath(); ctx.moveTo(x, cy + HEADER_H); ctx.lineTo(x, cy + CH); ctx.stroke();
  }
  // Horizontal grid lines (square cells: step = colW)
  for (let i = 1; i < 5; i++) {
    const y = cy + HEADER_H + i * colW;
    ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(cx + CW, y); ctx.stroke();
  }
  // Card outline
  ctx.strokeStyle = '#bbbbbb';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(cx + 0.3, cy + 0.3, CW - 0.6, CH - 0.6);

  // ── Right: work area (matches Half Page SVG right card position) ──
  const wx = 30, wy = 7, WW = 22, WH = 27;

  // Work area background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(wx, wy, WW, WH);

  // Interior lines
  if (workType === 'lined' || workType === 'grid') {
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 0.4;
    for (let y = wy + linePx; y < wy + WH - 0.3; y += linePx) {
      ctx.beginPath(); ctx.moveTo(wx + 0.5, y); ctx.lineTo(wx + WW - 0.5, y); ctx.stroke();
    }
    if (workType === 'grid') {
      for (let x = wx + linePx; x < wx + WW - 0.3; x += linePx) {
        ctx.beginPath(); ctx.moveTo(x, wy); ctx.lineTo(x, wy + WH); ctx.stroke();
      }
    }
  }
  // Work area border
  ctx.strokeStyle = '#bbbbbb';
  ctx.lineWidth = 0.6;
  ctx.strokeRect(wx + 0.3, wy + 0.3, WW - 0.6, WH - 0.6);
}

function renderCheckAnswers() {
  // Reset quick-checker state
  const input = document.getElementById('ca-answer-input');
  if (input) { input.value = ''; }
  const statusEl = document.getElementById('ca-status');
  if (statusEl) { statusEl.textContent = ''; statusEl.className = ''; }

  // Collapse the full sheet
  const fullSheet = document.getElementById('ca-full-sheet');
  const toggleBtn = document.getElementById('ca-toggle-full-btn');
  if (fullSheet) fullSheet.hidden = true;
  if (toggleBtn) toggleBtn.classList.remove('expanded');

  // Render the full sheet content (hidden until expanded)
  renderCaFullSheet();

  openOverlay('check-answers-overlay');

  // Focus the answer input after opening
  requestAnimationFrame(() => input?.focus());
}

function renderCaFullSheet() {
  const cols = BINGO_COLS;
  const called = {};
  cols.forEach(c => called[c] = []);

  const ci = state.currentIndex;
  if (ci >= 0) {
    state.history.slice(0, ci + 1).forEach(p => {
      if (called[p.column]) called[p.column].push(p);
    });
  }

  const container = document.getElementById('ca-columns');
  container.innerHTML = cols.map(col => {
    const rows = called[col];
    const body = rows.length
      ? rows.map(p => `<div class="ca-row"><span class="ca-problem">${escHtml(p.problem)}</span><span class="ca-answer">${escHtml(String(p.answer))}</span></div>`).join('')
      : `<div class="ca-empty">None called yet</div>`;
    return `
      <div class="ca-col">
        <div class="ca-col-header" style="background:var(--col-${col})">${col}</div>
        <div class="ca-col-body">${body}</div>
      </div>`;
  }).join('');
}

function updateCaStatus() {
  const input   = document.getElementById('ca-answer-input');
  const statusEl = document.getElementById('ca-status');
  if (!input || !statusEl) return;

  const raw = input.value.trim();
  if (raw === '') {
    statusEl.textContent = '';
    statusEl.className   = '';
    return;
  }

  const num = parseFloat(raw);
  if (isNaN(num)) {
    statusEl.textContent = '';
    statusEl.className   = '';
    return;
  }

  const col = document.querySelector('.ca-col-btn.active')?.dataset.col || 'B';
  const calledSet = state.calledAnswers[col] || new Set();
  const isCalled  = calledSet.has(num);

  statusEl.textContent = isCalled ? '✓ Called' : '✗ Not called';
  statusEl.className   = isCalled ? 'ca-called' : 'ca-not-called';
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function getColRgb(col) {
  const hex = (state.settings.cardColors || DEFAULT_COL_COLORS)[col] || DEFAULT_COL_COLORS[col];
  return hexToRgb(hex);
}
const BW_HEADER_RGB = [51, 51, 51];

/**
 * Draw one bingo card at (x, y) with the given card width.
 * Cells are always square (cellH = cellW). Fonts scale with cell size so
 * full-page and half-page layouts both look balanced.
 */
function drawBingoCard(doc, { x, y, cardW, card, cardIdx, headerH, showCardNumbers, color, pdfFont = 'helvetica' }) {
  const cols  = BINGO_COLS;
  const cellW = cardW / 5;
  const cellH = cellW;

  // Font sizes scale with cell geometry — generous for readability
  const headerFont    = Math.max(14, Math.round(headerH * 1.5));
  const dataFont      = Math.max(11, Math.round(cellW  * 0.5));
  const dataFontSmall = Math.max(9,  Math.round(cellW  * 0.38));
  const freeFont      = Math.max(10, Math.round(cellW  * 0.42));

  doc.setLineWidth(0.4);
  doc.setDrawColor(153, 153, 153);

  // Header row (FD so the BINGO band shares the same outline as the grid)
  cols.forEach((col, ci) => {
    const cx = x + ci * cellW;
    doc.setFillColor(...(color ? getColRgb(col) : BW_HEADER_RGB));
    doc.rect(cx, y, cellW, headerH, 'FD');
    doc.setTextColor(255, 255, 255);
    doc.setFont(pdfFont,'bold');
    doc.setFontSize(headerFont);
    doc.text(col, cx + cellW / 2, y + headerH / 2, { align: 'center', baseline: 'middle' });
  });

  // Data cells (FREE stays white — no shading)
  for (let row = 0; row < 5; row++) {
    for (let ci = 0; ci < 5; ci++) {
      const cx     = x + ci * cellW;
      const cy     = y + headerH + row * cellH;
      const val    = card[ci][row];
      const isFree = val === null;

      doc.setFillColor(255, 255, 255);
      doc.rect(cx, cy, cellW, cellH, 'FD');

      doc.setTextColor(30, 30, 30);
      doc.setFont(pdfFont,'bold');
      if (isFree) {
        doc.setFontSize(freeFont);
        doc.text('FREE', cx + cellW / 2, cy + cellH / 2, { align: 'center', baseline: 'middle' });
      } else {
        doc.setFontSize(String(val).length > 3 ? dataFontSmall : dataFont);
        doc.text(String(val), cx + cellW / 2, cy + cellH / 2, { align: 'center', baseline: 'middle' });
      }
    }
  }

  // Outer card border — closes any hairline gaps and unifies header + grid
  doc.setLineWidth(0.6);
  doc.rect(x, y, cardW, headerH + 5 * cellH);

  // Card number label below table
  if (showCardNumbers) {
    const labelY = y + headerH + 5 * cellH + Math.max(5, headerH * 0.45);
    doc.setTextColor(150, 150, 150);
    doc.setFont(pdfFont,'normal');
    doc.setFontSize(9);
    doc.text(`Card ${cardIdx + 1}`, x + cardW / 2, labelY, { align: 'center' });
  }
}

/**
 * Draw a "show your work" area. workType: 'lined' | 'grid' | 'blank'
 */
function drawWorkArea(doc, { x, y, w, h, workType = 'lined', lineSpacing = 7 }) {
  if (workType !== 'blank') {
    // Snap to whole squares so no partial cells appear at the edges
    const snapH = Math.floor(h / lineSpacing) * lineSpacing;
    const snapW = workType === 'grid' ? Math.floor(w / lineSpacing) * lineSpacing : w;

    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.2);
    for (let ly = y + lineSpacing; ly <= y + snapH; ly += lineSpacing) {
      doc.line(x, ly, x + snapW, ly);
    }
    if (workType === 'grid') {
      for (let lx = x + lineSpacing; lx <= x + snapW; lx += lineSpacing) {
        doc.line(lx, y, lx, y + snapH);
      }
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.4);
      doc.rect(x, y, snapW, snapH);
    }
  } else {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.4);
    doc.rect(x, y, w, h);
  }
}

function drawCallerSheet(doc, problems, color, pdfFont = 'helvetica') {
  const { jsPDF } = jspdf;
  doc.addPage('letter', 'portrait');
  const pageW = 215.9, pageH = 279.4, margin = 14;
  const cols = BINGO_COLS;

  // Title
  doc.setFont(pdfFont,'bold');
  doc.setFontSize(16);
  doc.setTextColor(40, 40, 40);
  doc.text('Caller Sheet', pageW / 2, margin, { align: 'center' });

  if (state.setName) {
    doc.setFontSize(9);
    doc.setFont(pdfFont,'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(state.setName, pageW / 2, margin + 6, { align: 'center' });
  }

  // Layout: 5 equal columns
  const colW = (pageW - 2 * margin) / 5;
  const headerH = 8;
  const rowH = 6.5;
  const tableTop = margin + 14;

  cols.forEach((col, ci) => {
    const x = margin + ci * colW;
    const colProblems = problems.filter(p => p.column === col);
    const rgb = color ? getColRgb(col) : BW_HEADER_RGB;

    // Column header
    doc.setFillColor(...rgb);
    doc.rect(x, tableTop, colW, headerH, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(pdfFont,'bold');
    doc.setFontSize(11);
    doc.text(col, x + colW / 2, tableTop + headerH / 2, { align: 'center', baseline: 'middle' });

    // Sub-headers
    const subTop = tableTop + headerH;
    doc.setFillColor(240, 240, 240);
    doc.rect(x, subTop, colW, 5, 'F');
    doc.setTextColor(80, 80, 80);
    doc.setFont(pdfFont,'bold');
    doc.setFontSize(6.5);
    doc.text('PROBLEM', x + 3, subTop + 3.2);
    doc.text('ANS', x + colW - 3, subTop + 3.2, { align: 'right' });

    // Rows
    colProblems.forEach((p, ri) => {
      const ry = subTop + 5 + ri * rowH;
      if (ri % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(x, ry, colW, rowH, 'F');
      }
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.2);
      doc.line(x, ry + rowH, x + colW, ry + rowH);

      doc.setTextColor(30, 30, 30);
      doc.setFont(pdfFont,'normal');
      doc.setFontSize(7);
      // Checkbox circle
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.circle(x + 3, ry + rowH / 2, 1.2);
      doc.text(String(p.problem), x + 6, ry + rowH / 2, { baseline: 'middle' });
      doc.setFont(pdfFont,'bold');
      doc.text(String(p.answer), x + colW - 2, ry + rowH / 2, { align: 'right', baseline: 'middle' });
    });

    // Border around column
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    const totalH = headerH + 5 + colProblems.length * rowH;
    doc.rect(x, tableTop, colW, totalH);
  });
}

async function generateCardsPDF(cards, opts) {
  const { style = 'full', color = true, showCardNumbers = true, workType = 'lined', callerSheet = true, lineSpacing = 7, fontKey = 'default' } = opts;
  const { jsPDF } = jspdf;

  if (style === 'full') {
    const doc     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
    const pdfFont = await ensurePdfFont(doc, fontKey);
    const margin = 12;
    const pageW  = 215.9;
    const cardW  = pageW - 2 * margin;  // 191.9
    const headerH = 14;
    cards.forEach((card, idx) => {
      if (idx > 0) doc.addPage();
      drawBingoCard(doc, { x: margin, y: margin, cardW, card, cardIdx: idx, headerH, showCardNumbers, color, pdfFont });
    });
    if (callerSheet) drawCallerSheet(doc, state.problems, color, pdfFont);
    doc.save('bingo-cards.pdf');
    return;
  }

  // Landscape styles share layout math
  const doc     = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pdfFont = await ensurePdfFont(doc, fontKey);
  const margin  = 12;
  const pageW   = 279.4;
  const pageH   = 215.9;
  const gap     = 10;
  const cardW   = (pageW - 2 * margin - gap) / 2;  // ~122.7
  const headerH = 10;
  const cellH   = cardW / 5;
  const cardTotalH = headerH + 5 * cellH + (showCardNumbers ? 8 : 0);
  const yStart  = margin + (pageH - 2 * margin - cardTotalH) / 2;

  if (style === 'half') {
    for (let i = 0; i < cards.length; i += 2) {
      if (i > 0) doc.addPage();
      drawBingoCard(doc, { x: margin, y: yStart, cardW, card: cards[i], cardIdx: i, headerH, showCardNumbers, color, pdfFont });
      if (i + 1 < cards.length) {
        drawBingoCard(doc, { x: margin + cardW + gap, y: yStart, cardW, card: cards[i + 1], cardIdx: i + 1, headerH, showCardNumbers, color, pdfFont });
      }
    }
  } else { // 'work'
    const workX = margin + cardW + gap;
    const workH = pageH - 2 * margin;  // fill full page height within margins
    cards.forEach((card, idx) => {
      if (idx > 0) doc.addPage();
      drawBingoCard(doc, { x: margin, y: yStart, cardW, card, cardIdx: idx, headerH, showCardNumbers, color, pdfFont });
      drawWorkArea(doc, { x: workX, y: margin, w: cardW, h: workH, workType, lineSpacing });
    });
  }

  if (callerSheet) drawCallerSheet(doc, state.problems, color, pdfFont);
  doc.save('bingo-cards.pdf');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
/** Inline SVG icon helper for JS-generated HTML. */
function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function renderMath(el, text) {
  if (text && text.includes('\\') && typeof katex !== 'undefined') {
    try {
      el.innerHTML = katex.renderToString(text, { throwOnError: false, displayMode: false });
      return;
    } catch(e) {}
  }
  el.textContent = text;
}

/* ============================================================
   OVERLAYS
   ============================================================ */
function openOverlay(id) {
  document.getElementById(id).hidden = false;
}
function closeOverlay(id) {
  document.getElementById(id).hidden = true;
}
function closeAllOverlays() {
  ['settings-overlay','help-overlay','confirm-overlay','csv-help-overlay','check-answers-overlay','roadmap-overlay'].forEach(closeOverlay);
}
function anyOverlayOpen() {
  return ['settings-overlay','help-overlay','confirm-overlay','csv-help-overlay','check-answers-overlay','roadmap-overlay'].some(id => !document.getElementById(id).hidden);
}

function showConfirm() { openOverlay('confirm-overlay'); }

/* ============================================================
   NOTIFICATIONS
   ============================================================ */
function showNotification(lines, type) {
  // type: 'success' | 'warning' | 'error'
  const el = document.getElementById('notification');
  el.className = type || '';
  el.innerHTML = `<div style="flex:1">${lines.map(l => `<div>${escHtml(l)}</div>`).join('')}</div>
    <span class="notif-close" id="notif-close-btn" title="Dismiss" role="button" aria-label="Dismiss">${icon('x')}</span>`;
  el.hidden = false;
  document.getElementById('notif-close-btn').onclick = () => { el.hidden = true; };
}

/* ============================================================
   BEFOREUNLOAD GUARD
   ============================================================ */
function updateBeforeUnload() {
  if (state.history.length > 0) {
    window.onbeforeunload = () => 'A game is in progress — are you sure you want to leave?';
  } else {
    window.onbeforeunload = null;
  }
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
document.addEventListener('keydown', e => {
  // Don't intercept when typing in inputs/selects
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  // Ignore OS keyboard auto-repeat — held keys shouldn't blast through the deck
  if (e.repeat) return;

  // "?" toggles the help overlay regardless of which overlay is currently open.
  if (e.key === '?' || e.key === '/') {
    e.preventDefault();
    if (anyOverlayOpen()) closeAllOverlays();
    else openOverlay('help-overlay');
    return;
  }

  if (anyOverlayOpen()) {
    if (e.key === 'Escape') { closeAllOverlays(); e.preventDefault(); }
    return;
  }

  switch (e.key) {
    case ' ':
    case 'ArrowRight':
      e.preventDefault();
      nextProblem(); render();
      if (state.settings.autoAdvanceOn && !isReplay()) startTimer();
      else stopTimer();
      updateBeforeUnload();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      prevProblem(); stopTimer(); render();
      break;
    case 'ArrowUp':
      e.preventDefault();
      if (!e.repeat && currentProblem()) { toggleAnswer(); render(); }
      break;
    case 'p': case 'P':
      e.preventDefault();
      pauseTimer(); render();
      break;
    case 'r': case 'R':
      e.preventDefault();
      showConfirm();
      break;
    case 's': case 'S':
      e.preventDefault();
      renderSettings();
      openOverlay('settings-overlay');
      break;
    case 'b': case 'B':
      e.preventDefault();
      state.settings.showBoard = !state.settings.showBoard;
      saveSettings(); render();
      break;
    case 'k': case 'K':
      e.preventDefault();
      state.settings.boardMode = state.settings.boardMode === 'grid' ? 'recent' : 'grid';
      _lastRenderedIndex = -1; // force a fresh static render of the strip
      saveSettings(); render();
      break;
    case 'f': case 'F':
      e.preventDefault();
      toggleFullscreen();
      break;
    case 'a': case 'A':
      e.preventDefault();
      if (state.currentView === 'caller') renderCheckAnswers();
      break;
    case 'Escape':
      // handled above
      break;
  }
});

/* ============================================================
   FULLSCREEN
   ============================================================ */
const FS_ENTER_SVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 5V1h4M9 1h4v4M1 9v4h4M13 9v4H9"/></svg>`;
const FS_EXIT_SVG  = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1v4H1M13 5H9V1M5 13V9H1M9 9h4v4"/></svg>`;

function updateFullscreenBtn() {
  const btn = document.getElementById('btn-fullscreen');
  if (!btn) return;
  const inFs = !!document.fullscreenElement;
  btn.innerHTML = inFs ? FS_EXIT_SVG : FS_ENTER_SVG;
  btn.setAttribute('aria-label', inFs ? 'Exit fullscreen' : 'Enter fullscreen');
  btn.title = inFs ? 'Exit fullscreen (F)' : 'Enter fullscreen (F)';
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

document.addEventListener('fullscreenchange', updateFullscreenBtn);

/* ============================================================
   EVENT WIRING
   ============================================================ */
function wireEvents() {
  document.getElementById('btn-next').onclick = () => {
    nextProblem(); render();
    if (state.settings.autoAdvanceOn && !isReplay()) startTimer();
    else stopTimer();
    updateBeforeUnload();
  };
  document.getElementById('btn-prev').onclick = () => {
    prevProblem(); stopTimer(); render();
  };
  document.getElementById('btn-settings').onclick = () => {
    renderSettings(); openOverlay('settings-overlay');
  };
  document.getElementById('btn-check-answers').onclick = () => renderCheckAnswers();
  document.getElementById('btn-close-check-answers').onclick = () => closeOverlay('check-answers-overlay');

  // Quick answer checker — column buttons
  document.getElementById('ca-col-btns').addEventListener('click', e => {
    const btn = e.target.closest('.ca-col-btn');
    if (!btn) return;
    document.querySelectorAll('.ca-col-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateCaStatus();
  });

  // Quick answer checker — live input
  document.getElementById('ca-answer-input').addEventListener('input', updateCaStatus);

  // Toggle full call sheet
  document.getElementById('ca-toggle-full-btn').addEventListener('click', () => {
    const fullSheet = document.getElementById('ca-full-sheet');
    const toggleBtn = document.getElementById('ca-toggle-full-btn');
    const isHidden  = fullSheet.hidden;
    fullSheet.hidden = !isHidden;
    toggleBtn.classList.toggle('expanded', isHidden);
    // Lazily update the sheet content when expanding (in case more were called since open)
    if (isHidden) renderCaFullSheet();
  });
  document.getElementById('btn-bingo').addEventListener('click', triggerBingo);
  document.getElementById('btn-close-settings').onclick = () => closeOverlay('settings-overlay');
  document.getElementById('btn-help').onclick = () => openOverlay('help-overlay');
  document.getElementById('btn-close-help').onclick = () => closeOverlay('help-overlay');
  document.getElementById('confirm-yes').onclick = () => {
    closeOverlay('confirm-overlay');
    resetGame(); render(); updateBeforeUnload();
  };
  document.getElementById('confirm-no').onclick = () => closeOverlay('confirm-overlay');

  // Click outside panel to close overlay
  document.querySelectorAll('.overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeOverlay(overlay.id);
    });
  });

  document.getElementById('btn-back-home').onclick = () => { stopTimer(); showView('home'); };
  document.getElementById('btn-close-csv-help').onclick = () => closeOverlay('csv-help-overlay');
  document.getElementById('btn-close-roadmap').onclick = () => closeOverlay('roadmap-overlay');
  document.getElementById('btn-fullscreen').onclick = () => toggleFullscreen();


  // Print view
  document.getElementById('pv-back-btn').onclick = () => showView('home');
  document.getElementById('pv-host-btn').onclick = () => {
    const MIN_PER_COL = 5;
    let blockMsg = null;

    // Check for blank problems or answers
    const blankProb = state.editRows.some(r => r.errors.includes('Problem is empty'));
    const blankAns  = state.editRows.some(r => r.errors.includes('Answer is required'));
    if (blankProb && blankAns) {
      blockMsg = 'Fix blank problems and answers before hosting.';
    } else if (blankProb) {
      blockMsg = 'Fix blank problems before hosting.';
    } else if (blankAns) {
      blockMsg = 'Fill in all blank answers before hosting.';
    }

    // Check for duplicate answers in the same column
    if (!blockMsg) {
      const hasDuplicate = state.editRows.some(r => r.errors.includes('Duplicate answer in this column'));
      if (hasDuplicate) blockMsg = 'Fix duplicate answers in the same column before hosting.';
    }

    // Check per-column minimums (using valid problems only)
    if (!blockMsg) {
      const colCounts = { B:0, I:0, N:0, G:0, O:0 };
      state.problems.forEach(p => { if (p.column in colCounts) colCounts[p.column]++; });
      const short = BINGO_COLS.filter(c => colCounts[c] < MIN_PER_COL);
      if (short.length) {
        const detail = short.map(c => `${c}: ${colCounts[c]}`).join(', ');
        blockMsg = `Each column needs at least ${MIN_PER_COL} problems. (${detail})`;
      }
    }

    if (blockMsg) {
      const errEl = document.getElementById('pv-host-error');
      errEl.textContent = blockMsg;
      errEl.classList.add('visible');
      clearTimeout(errEl._hideTimer);
      errEl._hideTimer = setTimeout(() => errEl.classList.remove('visible'), 4000);
      return;
    }

    resetGame(); showView('caller'); computeProblemFontSize(); render();
  };
  document.getElementById('pv-download-btn').onclick = () => pvDownloadCards();
  document.getElementById('pv-save-csv-btn').onclick = () => pvSaveSetCsv();

  // Style card picker
  document.getElementById('pv-style-picker').addEventListener('click', e => {
    const card = e.target.closest('.pv-style-card');
    if (!card) return;
    document.querySelectorAll('.pv-style-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
  });

  // Color/BW toggle
  document.getElementById('pv-options').addEventListener('click', e => {
    const btn = e.target.closest('[data-pv-color]');
    if (!btn) return;
    document.querySelectorAll('[data-pv-color]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });

  // Font picker
  const fontSel = document.getElementById('pv-font-select');
  populateFontSelect(fontSel);
  fontSel.addEventListener('change', e => setFont(e.target.value));

  // Work area style picker
  document.getElementById('pv-work-picker').addEventListener('click', e => {
    const btn = e.target.closest('[data-pv-work]');
    if (!btn) return;
    document.querySelectorAll('[data-pv-work]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isBlank = btn.dataset.pvWork === 'blank';
    document.getElementById('pv-work-scale-row').style.display = isBlank ? 'none' : '';
    updateWorkPreview();
    updateWorkThumb();
  });

  document.getElementById('pv-work-scale').addEventListener('input', () => {
    const v = parseFloat(document.getElementById('pv-work-scale').value);
    document.getElementById('pv-work-scale-val').textContent = v % 1 === 0 ? v + ' mm' : v.toFixed(1) + ' mm';
    document.getElementById('pv-work-scale-reset').hidden = (v === 7);
    updateWorkPreview();
  });

  document.getElementById('pv-work-scale-reset').addEventListener('click', () => {
    const slider = document.getElementById('pv-work-scale');
    slider.value = 7;
    document.getElementById('pv-work-scale-val').textContent = '7 mm';
    document.getElementById('pv-work-scale-reset').hidden = true;
    updateWorkPreview();
  });

  // Initially hide the line-spacing reset (default is 7 mm)
  document.getElementById('pv-work-scale-reset').hidden = true;
  updateWorkPreview();

  // Column color pickers
  document.getElementById('pv-color-pickers').addEventListener('input', e => {
    const input = e.target.closest('.pv-color-input');
    if (!input) return;
    const col = input.closest('.pv-color-row').dataset.col;
    state.settings.cardColors[col] = input.value;
    applyCardColors();
    saveSettings();
  });

  document.getElementById('pv-color-pickers').addEventListener('click', e => {
    const btn = e.target.closest('.pv-color-reset');
    if (!btn) return;
    const col = btn.closest('.pv-color-row').dataset.col;
    state.settings.cardColors[col] = DEFAULT_COL_COLORS[col];
    applyCardColors();
    saveSettings();
  });

  document.getElementById('file-input').onchange = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const csvText = ev.target.result;
      const name = file.name.replace(/\.csv$/i, '').replace(/[-_]/g, ' ');
      const { problems, errors, allRows } = loadProblems(csvText, file.name);
      applyLoadedSet(problems, name, allRows);
      // Persist the upload so it survives a reload (only if some problems parsed).
      if (problems.length) saveCustomSet(name, csvText);
      showView('print');
      renderPrintView();
      // Show fatal errors only — row-level errors are shown inline in the editable table
      const errEl = document.getElementById('pv-load-error');
      if (errEl) {
        if (errors.length) { errEl.textContent = errors.join('\n'); errEl.hidden = false; }
        else { errEl.hidden = true; }
      }
    };
    reader.readAsText(file);
  };

  window.addEventListener('resize', () => {
    clearTimeout(_resizeDebounceTimer);
    _resizeDebounceTimer = setTimeout(computeProblemFontSize, 150);
  });
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  wireEvents();
  applyCardColors();
  applyFont();
  audio.init();
  renderHomepage();
  showView('home');
}

init();
