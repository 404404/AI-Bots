const NODE_CPE_PREFIX = 'cpe:2.3:a:nodejs:node.js:';

function cpeValue(value) {
  return typeof value === 'string' ? value : value?.cpe;
}

export function validateNodeBinarySbom(sbom, { expectedVersion, expectedPath }) {
  if (!sbom || !Array.isArray(sbom.artifacts)) throw new Error('Syft SBOM has no artifacts array.');
  const nodes = sbom.artifacts.filter((artifact) => artifact.name === 'node' && artifact.type === 'binary');
  if (nodes.length !== 1) {
    throw new Error(`Expected exactly one Syft Node binary artifact; found ${nodes.length}.`);
  }
  const node = nodes[0];
  if (node.version !== expectedVersion || node.foundBy !== 'binary-classifier-cataloger'
    || !Array.isArray(node.locations) || !node.locations.some((location) => location.path === expectedPath)) {
    throw new Error(`Syft Node binary identity did not match expected version ${expectedVersion}, classifier, and path ${expectedPath}.`);
  }
  if (typeof node.id !== 'string' || node.id.trim().length === 0) {
    throw new Error('Syft Node binary artifact is missing its unique package ID.');
  }
  const cpes = (node.CPEs ?? node.cpes ?? []).map(cpeValue).filter(Boolean);
  const nodeCpes = cpes.filter((cpe) => cpe.startsWith(NODE_CPE_PREFIX));
  if (nodeCpes.length === 0) {
    throw new Error('Syft identified the Node binary but did not emit the expected nodejs:node.js NVD CPE.');
  }
  const cpeVersions = nodeCpes.map((cpe) => {
    const fields = cpe.split(':');
    if (fields.length !== 13 || fields[0] !== 'cpe' || fields[1] !== '2.3' || fields[2] !== 'a' || fields[3] !== 'nodejs' || fields[4] !== 'node.js') {
      throw new Error('Syft emitted a malformed nodejs:node.js CPE.');
    }
    return fields[5];
  });
  if (cpeVersions.some((version) => version !== '*' && version !== expectedVersion)) {
    throw new Error(`Syft Node CPE version is incompatible with artifact version ${expectedVersion}.`);
  }
  return {
    id: node.id,
    name: node.name,
    version: node.version,
    type: node.type,
    foundBy: node.foundBy,
    locations: node.locations,
    purl: node.purl ?? null,
    cpes,
    cpeVersion: cpeVersions.every((version) => version === '*') ? 'wildcard' : expectedVersion,
    expectedPath,
  };
}

export function validateGrypeDatabase(status, observedAt, maxAgeHours = 48) {
  const built = status?.built ?? status?.Built;
  const schemaVersion = status?.schemaVersion ?? status?.SchemaVersion;
  const checksum = status?.checksum ?? status?.Checksum;
  const source = status?.from ?? status?.From;
  const valid = status?.valid ?? status?.Valid;
  const parsedBuilt = typeof built === 'string' ? Date.parse(built) : NaN;
  const parsedObserved = Date.parse(observedAt);
  if (!Number.isFinite(parsedBuilt) || !Number.isFinite(parsedObserved)
    || !(typeof schemaVersion === 'string' && /^v?\d+(?:\.\d+\.\d+)?$/u.test(schemaVersion))
    || valid !== true || typeof source !== 'string' || source.trim().length === 0) {
    throw new Error('Grype DB status is missing a valid built time/schema/source or does not report valid=true.');
  }
  const ageHours = (parsedObserved - parsedBuilt) / 3_600_000;
  if (ageHours < 0 || ageHours > maxAgeHours) {
    throw new Error(`Grype vulnerability database age ${ageHours.toFixed(2)}h exceeds the ${maxAgeHours}h freshness limit or is in the future.`);
  }
  return { built, schemaVersion, source, checksum: checksum ?? null, valid, observedAt, ageHours };
}

export function summarizeNodeGrypeFindings(scan, expectedNode) {
  if (!scan || !Array.isArray(scan.matches)) throw new Error('Grype JSON has no matches array.');
  if (!expectedNode || typeof expectedNode.id !== 'string' || !expectedNode.expectedPath || !expectedNode.version) {
    throw new Error('Verified Syft Node artifact identity is required before analyzing Grype findings.');
  }
  const nodeMatches = scan.matches.filter((match) => {
    const artifact = match.artifact;
    return artifact?.id === expectedNode.id || (artifact?.name === 'node' && artifact?.type === 'binary');
  });
  for (const match of nodeMatches) {
    const artifact = match.artifact;
    if (artifact?.id !== expectedNode.id || artifact?.name !== 'node' || artifact?.type !== 'binary'
      || artifact?.version !== expectedNode.version || !Array.isArray(artifact.locations)
      || !artifact.locations.some((location) => location.path === expectedNode.expectedPath)) {
      throw new Error('Grype Node finding artifact ID, type, version, or location does not match the verified Syft Node ELF.');
    }
  }
  const highCritical = nodeMatches.filter((match) => ['HIGH', 'CRITICAL'].includes(String(match.vulnerability?.severity).toUpperCase()));
  return {
    nodeMatchCount: nodeMatches.length,
    highCriticalCount: highCritical.length,
    findings: highCritical.map((match) => ({
      id: match.vulnerability.id,
      severity: match.vulnerability.severity,
      fix: match.vulnerability.fix ?? null,
      matchDetails: match.matchDetails ?? [],
      artifact: match.artifact,
    })),
  };
}
