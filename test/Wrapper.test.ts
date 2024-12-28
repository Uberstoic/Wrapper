import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LiquidityWrapper, IERC20 } from "../typechain-types";

describe("LiquidityWrapper", function () {
  let wrapper: LiquidityWrapper;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let token: IERC20;
  let usdt: IERC20;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();

    // Deploy mock tokens and price feeds for testing
    const MockToken = await ethers.getContractFactory("MockERC20");
    token = await MockToken.deploy("Mock Token", "TOKEN");
    usdt = await MockToken.deploy("Mock USDT", "USDT");

    const MockChainlinkOracle = await ethers.getContractFactory("MockChainlinkOracle");
    const chainlinkOracle = await MockChainlinkOracle.deploy();

    const MockPythOracle = await ethers.getContractFactory("MockPythOracle");
    const pythOracle = await MockPythOracle.deploy();

    // Deploy Uniswap V2 contracts
    const UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
    const factory = await UniswapV2Factory.deploy(owner.address);

    const UniswapV2Router02 = await ethers.getContractFactory("UniswapV2Router02");
    const router = await UniswapV2Router02.deploy(factory.address, ethers.constants.AddressZero);

    // Deploy wrapper contract
    const Wrapper = await ethers.getContractFactory("LiquidityWrapper");
    wrapper = await Wrapper.deploy(
      router.address,
      chainlinkOracle.address,
      pythOracle.address,
      token.address,
      usdt.address
    );
  });

  describe("Price Feeds", function () {
    it("Should get price from Chainlink", async function () {
      const price = await wrapper.getChainlinkPrice();
      expect(price).to.be.gt(0);
    });

    it("Should get price from Pyth", async function () {
      const price = await wrapper.getPythPrice();
      expect(price).to.be.gt(0);
    });
  });

  describe("Liquidity Addition", function () {
    beforeEach(async function () {
      // Mint some tokens to user
      await usdt.mint(user.address, ethers.utils.parseEther("1000"));
      await token.mint(user.address, ethers.utils.parseEther("1000"));

      // Approve wrapper to spend tokens
      await usdt.connect(user).approve(wrapper.address, ethers.constants.MaxUint256);
      await token.connect(user).approve(wrapper.address, ethers.constants.MaxUint256);
    });

    it("Should add liquidity with USDT only", async function () {
      const usdtAmount = ethers.utils.parseEther("100");
      await wrapper.connect(user).addLiquidityWithUSDT(usdtAmount);
      
      // Add assertions to check liquidity was added correctly
    });
  });
});
