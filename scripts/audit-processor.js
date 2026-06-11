#!/usr/bin/env node
const fs = require('fs');

function analyzeBooleansInCode(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');

  const booleanMatches = code.match(/const\s+\[(is\w+|has\w+)/g) || [];
  const flags = booleanMatches.map(m => m.replace(/const\s+\[/, ''));

  const totalCombinations = Math.pow(2, flags.length);

  const report = {
    fileAudited: filePath,
    detectedFlags: flags,
    complexity: `${flags.length} flags = ${totalCombinations} combinaciones posibles`,
    impossibleStatesDetected: []
  };

  if (flags.includes('isLoading') && flags.includes('isError')) {
    report.impossibleStatesDetected.push({
      combination: { isLoading: true, isError: true },
      severity: "CRITICAL",
      description: "La interfaz puede intentar renderizar un spinner de carga y un mensaje de error simultáneamente."
    });
  }

  if (flags.includes('isLoading') && flags.includes('isSuccess')) {
    report.impossibleStatesDetected.push({
      combination: { isLoading: true, isSuccess: true },
      severity: "CRITICAL",
      description: "Respuesta de red tardía puede sobreescribir datos válidos mostrando un estado de carga infinito."
    });
  }

  return report;
}

module.exports = { analyzeBooleansInCode };

const file = process.argv[2];
if (file) {
  console.log(JSON.stringify(analyzeBooleansInCode(file), null, 2));
}
