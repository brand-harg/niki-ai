import { writeFileSync } from "node:fs";

const problems = [];

function add(category, prompt, tags = []) {
  problems.push({
    id: `stress-${String(problems.length + 1).padStart(3, "0")}`,
    category,
    prompt,
    tags,
  });
}

const arithmeticTemplates = [
  (n) => `Solve for n: ${120 + n} / (${3 + (n % 6)} * ${4 + (n % 5)}) + ${2 + (n % 7)}^2 - ${10 + (n % 13)} = n`,
  (n) => `Simplify ${n + 2}/${n + 5} + ${n + 4}/${n + 8} - ${(n % 5) / 10}`,
  (n) => `A price is $${35 + n}. It is ${(n % 4 + 1) * 5}% off, then has ${(n % 6) + 4}% tax. Find the final price.`,
];

const algebraTemplates = [
  (n) => `Factor x^4 - ${n ** 2}`,
  (n) => `Use synthetic division on x^4 + 0x^3 - ${n}x^2 + 0x - 1 by x - ${n % 5 + 1}`,
  (n) => `Divide ${n}x^3 - ${(n % 7) + 2}x^2 + ${(n % 5) - 2}x + 1 by ${n % 3 + 2}x - ${n % 5 + 1}`,
  (n) => `Solve ${n % 4 + 1}x^2 - ${(n % 9) + 3}x + ${n % 5 + 1} = 0 using the quadratic formula`,
  (n) => `Complete the square for x^2 ${n % 2 ? "-" : "+"} ${2 * (n % 8 + 1)}x + ${n % 11}`,
];

const calculusTemplates = [
  (n) => `Find the derivative of e^(x^2 + ${n}) * ln(x)`,
  (n) => `Differentiate y = sin(${n % 6 + 2}x^2) * cos(x)`,
  (n) => `Evaluate the limit as x approaches ${n % 5 + 1} of (x^2 - ${(n % 5 + 1) ** 2})/(x - ${n % 5 + 1})`,
  (n) => `Evaluate the limit as x approaches 0 of (e^(${n % 5 + 1}x) - 1)/x`,
  (n) => `Integrate x^${n % 4 + 1} * sin(x^${n % 4 + 2}) dx`,
  (n) => `Integrate by parts: integral of x^${n % 3 + 1} ln(${n % 4 + 2}x) dx`,
  (n) => `Solve the differential equation y'' - ${n % 5 + 1}y' + ${n % 4 + 2}y = 0`,
];

const linearTemplates = [
  (n) => `Find the inverse of [[${n % 4 + 1},2,1],[0,${n % 5 + 2},3],[1,0,${n % 6 + 2}]]`,
  (n) => `Find eigenvalues of [[0,${n % 5 + 1}],[-${n % 5 + 2},0]]`,
  (n) => `Multiply matrices A=[[1,${n % 4 + 1},0],[2,1,${n % 3 + 2}],[0,1,1]] and B=[[${n % 5 + 1},0,1],[1,2,0],[0,${n % 6 + 1},3]]`,
  (n) => `Row reduce the system x+y+z=${n + 3}, 2x-y+z=${n % 7 + 2}, x+2y-z=${n % 9}`,
];

const statsTemplates = [
  (n) => `Find mean, variance, and standard deviation for ${n}, ${n + 2}, ${n + 2}, ${n + 5}, ${n + 8}`,
  (n) => `If P(A)=0.${(n % 5) + 2}, P(B)=0.${(n % 4) + 4}, and P(A and B)=0.${(n % 3) + 1}, find P(A|B)`,
  (n) => `Evaluate the sum from i=1 to ${n % 8 + 4} of i^2 + ${n % 5 + 1}i`,
  (n) => `Find the z-score for x=${70 + n}, mean=${60 + (n % 10)}, standard deviation=${5 + (n % 7)}`,
];

const recursiveTemplates = [
  (n) => `First solve a = ${n} + ${n % 5}. Then use that a to evaluate a^2 - 3a + 2.`,
  (n) => `Let u be the derivative of ${n}x^3 - x. Then evaluate u at x = ${n % 4 + 1}.`,
  (n) => `Find the determinant D of [[${n},1],[2,${n + 1}]], then solve Dx + 2 = ${n * 3}.`,
  (n) => `Find the slope of y=${n}x+${n % 7}, then use it as m in y - 2 = m(x - 1).`,
];

const templates = [
  ["arithmetic", arithmeticTemplates],
  ["algebra-trap", algebraTemplates],
  ["calculus-trap", calculusTemplates],
  ["linear-algebra-trap", linearTemplates],
  ["statistics-probability", statsTemplates],
  ["recursive-substitution", recursiveTemplates],
];

for (let i = 1; problems.length < 300; i++) {
  for (const [category, group] of templates) {
    for (const template of group) {
      if (problems.length >= 300) break;
      add(category, template(i), ["stress", category]);
    }
  }
}

writeFileSync("scripts/math-stress-problems.json", `${JSON.stringify(problems, null, 2)}\n`);
console.log(`Wrote ${problems.length} problems to scripts/math-stress-problems.json`);
