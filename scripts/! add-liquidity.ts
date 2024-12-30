import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Adding liquidity with account:", deployer.address);

  // Addresses for Sepolia
  const ROUTER_ADDRESS = "0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008"; // Uniswap V2 Router on Sepolia
  const YOUR_TOKEN_ADDRESS = "0x657eB176645e44A4128c38730e666A7B201e0Cf9";

  // Get contract instances
  const yourToken = await ethers.getContractAt("IERC20", YOUR_TOKEN_ADDRESS);
  
  // Router ABI - only required functions
  const routerAbi = [
    "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external payable returns (uint amountToken, uint amountETH, uint liquidity)"
  ];
  const router = new ethers.Contract(ROUTER_ADDRESS, routerAbi, deployer);

  // Parameters for adding liquidity
  const tokenAmount = ethers.utils.parseEther("10"); // decreasing to 10 tokens
  const ethAmount = ethers.utils.parseEther("0.001"); // decreasing to 0.001 ETH
  
  try {
    console.log(`\nApproving ${ethers.utils.formatEther(tokenAmount)} tokens for Router...`);
    const approveTx = await yourToken.approve(ROUTER_ADDRESS, tokenAmount);
    await approveTx.wait();
    console.log("Approved!");

    console.log(`\nAdding liquidity...`);
    console.log(`Token Amount: ${ethers.utils.formatEther(tokenAmount)} YOUR_TOKEN`);
    console.log(`ETH Amount: ${ethers.utils.formatEther(ethAmount)} ETH`);

    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

    const addLiquidityTx = await router.addLiquidityETH(
      YOUR_TOKEN_ADDRESS,
      tokenAmount,
      0, // slippage 100%
      0, // slippage 100%
      deployer.address,
      deadline,
      { value: ethAmount }
    );
    
    console.log("Waiting for transaction...");
    const receipt = await addLiquidityTx.wait();
    console.log(`Transaction confirmed! Hash: ${receipt.transactionHash}`);
    console.log(`\nLiquidity added successfully!`);
    
  } catch (error) {
    console.error("Error:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
