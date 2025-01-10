import { run } from "hardhat";

async function main() {
  const WRAPPER_ADDRESS = process.env.WRAPPER_ADDRESS;
  if (!WRAPPER_ADDRESS) {
    throw new Error("Please set WRAPPER_ADDRESS in your environment");
  }

  console.log("Verifying Wrapper contract...");
  
  try {
    await run("verify:verify", {
      address: WRAPPER_ADDRESS,
      constructorArguments: [
        process.env.UNISWAP_ROUTER_ADDRESS,
        process.env.CHAINLINK_ORACLE_ADDRESS,
        process.env.PYTH_ORACLE_ADDRESS,
        process.env.TOKEN_ADDRESS,
        process.env.USDT_ADDRESS,
      ],
    });
    console.log("Verification completed!");
  } catch (error) {
    console.error("Verification failed:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
