#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const launch = JSON.parse(readFileSync('/tmp/dsh-runtime/launch.json', 'utf8'));
const url = new URL(launch.url);
if (!url.searchParams.has('token'))
  throw new Error('No active DSH Host launch token is available.');
process.stdout.write(`${url.toString()}\n`);
