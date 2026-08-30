import { init } from './init.js';
import { generate } from './generate.js';
import { doctor } from './doctor.js';
import { CREDIT_LINE, CORSEN_CONTEXT_VERSION } from '@corsenai/corsen-context';

const args = process.argv.slice(2);
const command = args[0];

const VERSION = CORSEN_CONTEXT_VERSION;

function printHelp() {
  console.log(`
  corsen-context v${VERSION}
  ${CREDIT_LINE}

  Usage:
    corsen-context <command> [options]

  Commands:
    init        Detect framework, create config & integration files
    generate    Generate llms.txt from a live site (--full adds llms-full.txt)
    doctor      Diagnose public discovery, MCP, and WebMCP surfaces

  Options:
    --help      Show this help message
    --version   Show version number

  Examples:
    npx @corsenai/corsen-context-cli init
    npx @corsenai/corsen-context-cli generate --url https://mysite.com
    npx @corsenai/corsen-context-cli doctor --url https://mysite.com
  `);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    return;
  }

  switch (command) {
    case 'init':
      await init();
      break;
    case 'generate':
      await generate(args.slice(1));
      break;
    case 'doctor':
      await doctor(args.slice(1));
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
