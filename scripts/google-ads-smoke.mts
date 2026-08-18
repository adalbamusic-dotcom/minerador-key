import nextEnv from "@next/env";
import {
  formatGoogleAdsSmokeError,
  GOOGLE_ADS_SMOKE_HELP,
  loadGoogleAdsSmokeEnvironment,
  parseGoogleAdsSmokeArguments,
  runGoogleAdsSmoke,
  validateGoogleAdsSmokeConfiguration,
  type GoogleAdsSmokeStage,
} from "../lib/google/ads/smoke.ts";

const { loadEnvConfig } = nextEnv;

function print(value: unknown, error = false) {
  (error ? console.error : console.log)(JSON.stringify(value, null, 2));
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) {
    print(GOOGLE_ADS_SMOKE_HELP);
    return;
  }

  let stage: GoogleAdsSmokeStage = "argument_validation";
  let apiRequestStarted = false;
  try {
    if (argv.includes("--check-config")) {
      if (argv.length !== 1) throw new Error("--check-config não aceita outros argumentos.");
      stage = "environment_loading";
      loadGoogleAdsSmokeEnvironment(loadEnvConfig, process.cwd());
      stage = "configuration_validation";
      print(validateGoogleAdsSmokeConfiguration(process.env));
      return;
    }

    const input = parseGoogleAdsSmokeArguments(argv);
    stage = "environment_loading";
    loadGoogleAdsSmokeEnvironment(loadEnvConfig, process.cwd());
    stage = "configuration_validation";
    validateGoogleAdsSmokeConfiguration(process.env);
    apiRequestStarted = true;
    const result = await runGoogleAdsSmoke(input, (nextStage) => { stage = nextStage; });
    print(result);
  } catch (error) {
    print({ smoke: "google_ads", error: formatGoogleAdsSmokeError(error, stage, apiRequestStarted) }, true);
    process.exitCode = 1;
  }
}

void main();
