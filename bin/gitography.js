#!/usr/bin/env node
/**
 * gitography CLI entry point.
 */

import process from 'node:process';
import { run } from '../src/cli.js';

process.exitCode = run(process.argv.slice(2));
