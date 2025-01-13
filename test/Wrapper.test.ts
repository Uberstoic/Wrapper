import { expect } from "chai";
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
dotenv.config();
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { 
  LiquidityWrapper, 
  IUniswapV2Router02,
  MockERC20, 
  MockChainlinkOracle,
  MockPythOracle,
  MockUniswapRouter,
  MockERC20__factory,
  MockChainlinkOracle__factory,
  MockPythOracle__factory,
  LiquidityWrapper__factory,
  MockUniswapRouter__factory
} from "../typechain-types";

const provider = new ethers.providers.JsonRpcProvider(
  `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
);

describe("LiquidityWrapper", function () {
  let wrapper: LiquidityWrapper;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let otherUser: SignerWithAddress;
  let token: MockERC20;
  let usdt: MockERC20;
  let chainlinkOracle: MockChainlinkOracle;
  let pythOracle: MockPythOracle;
  let uniswapRouter: MockUniswapRouter;

  beforeEach(async function () {
    [owner, user, otherUser] = await ethers.getSigners();

    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory("MockERC20") as MockERC20__factory;
    token = await MockToken.deploy(
      "Mock Token",
      "TOKEN",
      ethers.utils.parseEther("1000000")
    );
    await token.deployed();
    
    usdt = await MockToken.deploy(
      "Mock USDT",
      "USDT",
      ethers.utils.parseEther("1000000")
    );
    await usdt.deployed();

    // Deploy mock oracles
    const MockChainlink = await ethers.getContractFactory("MockChainlinkOracle") as MockChainlinkOracle__factory;
    chainlinkOracle = await MockChainlink.deploy();
    await chainlinkOracle.deployed();

    const MockPyth = await ethers.getContractFactory("MockPythOracle") as MockPythOracle__factory;
    pythOracle = await MockPyth.deploy();
    await pythOracle.deployed();

    // Deploy mock router
    const MockRouter = await ethers.getContractFactory("MockUniswapRouter") as MockUniswapRouter__factory;
    uniswapRouter = await MockRouter.deploy();
    await uniswapRouter.deployed();

    // Set token address in router
    await uniswapRouter.setToken(token.address);

    // Deploy wrapper contract
    const Wrapper = await ethers.getContractFactory("LiquidityWrapper") as LiquidityWrapper__factory;
    wrapper = await Wrapper.deploy(
      uniswapRouter.address,
      chainlinkOracle.address,
      pythOracle.address,
      token.address,
      usdt.address
    );
    await wrapper.deployed();

    // Setup initial token balances for testing
    await token.mint(user.address, ethers.utils.parseEther("1000"));
    await usdt.mint(user.address, ethers.utils.parseEther("1000000")); // 1M USDT
    await token.mint(uniswapRouter.address, ethers.utils.parseEther("1000000")); // Liquidity for swaps
    await usdt.mint(uniswapRouter.address, ethers.utils.parseEther("1000000")); // Liquidity for swaps

    // Approve wrapper to spend tokens
    await usdt.connect(user).approve(wrapper.address, ethers.constants.MaxUint256);
    await token.connect(user).approve(wrapper.address, ethers.constants.MaxUint256);
  });

  describe("Deployment", function () {
    it("Should set the correct token addresses", async function () {
      expect(await wrapper.token()).to.equal(token.address);
      expect(await wrapper.usdt()).to.equal(usdt.address);
    });

    it("Should set the correct oracle addresses", async function () {
      expect(await wrapper.chainlinkOracle()).to.equal(chainlinkOracle.address);
      expect(await wrapper.pythOracle()).to.equal(pythOracle.address);
    });

    it("Should set the correct owner", async function () {
      expect(await wrapper.owner()).to.equal(owner.address);
    });

    it("Should revert if deployed with zero addresses", async function () {
      const Wrapper = await ethers.getContractFactory("LiquidityWrapper") as LiquidityWrapper__factory;
      
      await expect(
        Wrapper.deploy(
          ethers.constants.AddressZero,
          chainlinkOracle.address,
          pythOracle.address,
          token.address,
          usdt.address
        )
      ).to.be.reverted;

      await expect(
        Wrapper.deploy(
          uniswapRouter.address,
          ethers.constants.AddressZero,
          pythOracle.address,
          token.address,
          usdt.address
        )
      ).to.be.reverted;

      await expect(
        Wrapper.deploy(
          uniswapRouter.address,
          chainlinkOracle.address,
          ethers.constants.AddressZero,
          token.address,
          usdt.address
        )
      ).to.be.reverted;

      await expect(
        Wrapper.deploy(
          uniswapRouter.address,
          chainlinkOracle.address,
          pythOracle.address,
          ethers.constants.AddressZero,
          usdt.address
        )
      ).to.be.reverted;

      await expect(
        Wrapper.deploy(
          uniswapRouter.address,
          chainlinkOracle.address,
          pythOracle.address,
          token.address,
          ethers.constants.AddressZero
        )
      ).to.be.reverted;
    });
  });

  describe("IUniswapV2Router02", function () {
    let uniswapRouter: MockUniswapRouter;
    let tokenA: MockERC20;
    let tokenB: MockERC20;
    let deployer: SignerWithAddress;
    let liquidity: BigNumber;
    let amountADesired: BigNumber;
    let amountBDesired: BigNumber;
    let amountAMin: BigNumber;
    let amountBMin: BigNumber;
    let to: string;
    let deadline: number;

    before(async function () {
        [deployer] = await ethers.getSigners();
        
        const MockToken = await ethers.getContractFactory("MockERC20");
        tokenA = await MockToken.deploy("Token A", "TKNA", ethers.utils.parseEther("1000000"));
        await tokenA.deployed();
        
        tokenB = await MockToken.deploy("Token B", "TKNB", ethers.utils.parseEther("1000000"));
        await tokenB.deployed();

        const MockRouter = await ethers.getContractFactory("MockUniswapRouter");
        uniswapRouter = await MockRouter.deploy();
        await uniswapRouter.deployed();
        
        amountADesired = ethers.utils.parseEther("100");
        amountBDesired = ethers.utils.parseEther("100");
        amountAMin = ethers.utils.parseEther("90");
        amountBMin = ethers.utils.parseEther("90");
        liquidity = ethers.utils.parseEther("100");
        to = deployer.address;
        deadline = Math.floor(Date.now() / 1000) + 3600;

        await tokenA.mint(deployer.address, amountADesired.mul(2));
        await tokenB.mint(deployer.address, amountBDesired.mul(2));

        await tokenA.approve(uniswapRouter.address, amountADesired.mul(2));
        await tokenB.approve(uniswapRouter.address, amountBDesired.mul(2));
    });

    it("should add liquidity", async function () {
        const tx = await uniswapRouter.addLiquidity(
            tokenA.address,
            tokenB.address,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin,
            to,
            deadline
        );
        await expect(tx).to.emit(uniswapRouter, "LiquidityAdded").withArgs(tokenA.address, tokenB.address, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline);
    });

    it("should remove liquidity", async function () {
        const tx = await uniswapRouter.removeLiquidity(
            tokenA.address,
            tokenB.address,
            liquidity,
            amountAMin,
            amountBMin,
            to,
            deadline
        );
        await expect(tx).to.emit(uniswapRouter, "LiquidityRemoved").withArgs(tokenA.address, tokenB.address, liquidity, amountAMin, amountBMin, to, deadline);
    });

    it("should swap exact tokens for tokens", async function () {
        const amountIn = ethers.utils.parseEther("10");
        const amountOutMin = ethers.utils.parseEther("9");
        const path = [tokenA.address, tokenB.address];
        
        // Mint more tokens for tokenA and approve
        await tokenA.mint(deployer.address, amountIn.mul(2));
        await tokenA.approve(uniswapRouter.address, amountIn.mul(2));
        
        // Mint tokens for the router to be able to send back
        await tokenB.mint(uniswapRouter.address, amountOutMin.mul(2));
        
        const tx = await uniswapRouter.swapExactTokensForTokens(
            amountIn,
            amountOutMin,
            path,
            deployer.address,
            deadline
        );
        
        await expect(tx)
            .to.emit(tokenA, "Transfer")
            .and.to.emit(tokenB, "Transfer");
    });

    it("should get amounts out", async function () {
        const amountIn = ethers.utils.parseEther("10");
        const path = [tokenA.address, tokenB.address];
        const amounts = await uniswapRouter.getAmountsOut(amountIn, path);
        expect(amounts).to.be.an("array").that.is.not.empty;
    });

    it("should get amounts in", async function () {
        const amountOut = ethers.utils.parseEther("10");
        const path = [tokenA.address, tokenB.address];
        const amounts = await uniswapRouter.getAmountsIn(amountOut, path);
        expect(amounts).to.be.an("array").that.is.not.empty;
    });
  });

  describe("Price Feeds", function () {
    beforeEach(async function () {
      await chainlinkOracle.setPrice(30000 * 10**8); // $30,000
      await pythOracle.setPrice(30000 * 10**8); // $30,000
    });

    it("Should get price from Chainlink", async function () {
      const price = await wrapper.getChainlinkPrice();
      expect(price).to.equal(30000 * 10**8);
    });

    it("Should get price from Pyth", async function () {
      const price = await wrapper.getPythPrice();
      expect(price).to.equal(30000 * 10**8);
    });

    it("Should get aggregated price", async function () {
      const price = await wrapper.getAggregatedPrice();
      expect(price).to.equal(30000 * 10**8);
    });

    it("Should revert on Chainlink oracle failure", async function () {
      await chainlinkOracle.setPrice(0);
      await expect(wrapper.getChainlinkPrice())
        .to.be.revertedWith("Invalid Chainlink price");
    });

    it("Should revert on Pyth oracle failure", async function () {
      await pythOracle.setPrice(0);
      await expect(wrapper.getPythPrice())
        .to.be.revertedWith("Invalid Pyth price");
    });

    it("Should use average when both oracles work", async function () {
      await chainlinkOracle.setPrice(3000 * 10**8);
      await pythOracle.setPrice(4000 * 10**8);
      const price = await wrapper.getAggregatedPrice();
      expect(price).to.equal(3500 * 10**8);
    });

    it("Should handle extreme price differences between oracles", async function () {
      await chainlinkOracle.setPrice(29000 * 10**8); // $29,000
      await pythOracle.setPrice(31000 * 10**8);   // $31,000
      const price = await wrapper.getAggregatedPrice();
      expect(price).to.equal(30000 * 10**8); // Average should be $30,000
    });

    it("Should handle price updates from oracles", async function () {
      // Initial prices
      await chainlinkOracle.setPrice(30000 * 10**8);
      await pythOracle.setPrice(30000 * 10**8);
      let price = await wrapper.getAggregatedPrice();
      expect(price).to.equal(30000 * 10**8);

      // Update prices
      await chainlinkOracle.setPrice(31000 * 10**8);
      await pythOracle.setPrice(31000 * 10**8);
      price = await wrapper.getAggregatedPrice();
      expect(price).to.equal(31000 * 10**8);
    });
  });

  describe("Liquidity Addition with USDT", function () {
    beforeEach(async function () {
      await chainlinkOracle.setPrice(30000 * 10**8); // $30,000
      await pythOracle.setPrice(30000 * 10**8); // $30,000
    });

    it("Should revert when adding liquidity with insufficient USDT", async function () {
      const largeAmount = ethers.utils.parseEther("2000000"); // More than minted
      await expect(
        wrapper.connect(user).addLiquidityWithUSDT(largeAmount)
      ).to.be.revertedWith("Insufficient USDT balance");
    });

    it("Should revert when USDT not approved", async function () {
      await usdt.connect(user).approve(wrapper.address, 0);
      const amount = ethers.utils.parseEther("100");
      await expect(
        wrapper.connect(user).addLiquidityWithUSDT(amount)
      ).to.be.revertedWith("Insufficient USDT allowance");
    });

    it("Should revert when amount is zero", async function () {
      await expect(
        wrapper.connect(user).addLiquidityWithUSDT(0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should transfer USDT from user", async function () {
      const amount = ethers.utils.parseEther("100");
      const balanceBefore = await usdt.balanceOf(user.address);
      
      await wrapper.connect(user).addLiquidityWithUSDT(amount);
      
      const balanceAfter = await usdt.balanceOf(user.address);
      expect(balanceBefore.sub(balanceAfter)).to.equal(amount);
    });

    it("Should handle minimum amounts", async function () {
      const amount = ethers.utils.parseEther("0.000001"); // Very small amount
      await expect(
        wrapper.connect(user).addLiquidityWithUSDT(amount)
      ).to.not.be.reverted;
    });

    it("Should handle maximum amounts", async function () {
      const amount = ethers.utils.parseEther("1000000"); // 1M USDT
      await expect(
        wrapper.connect(user).addLiquidityWithUSDT(amount)
      ).to.not.be.reverted;
    });

    it("Should handle multiple consecutive additions", async function () {
      const amount = ethers.utils.parseEther("1000");
      
      // Add liquidity multiple times
      await wrapper.connect(user).addLiquidityWithUSDT(amount);
      await wrapper.connect(user).addLiquidityWithUSDT(amount);
      await wrapper.connect(user).addLiquidityWithUSDT(amount);

      // Check final balance
      const finalBalance = await usdt.balanceOf(user.address);
      const expectedBalance = ethers.utils.parseEther("1000000").sub(amount.mul(3));
      expect(finalBalance).to.equal(expectedBalance);
    });
  });

  describe("Liquidity Addition with Both Tokens", function () {
    beforeEach(async function () {
      await chainlinkOracle.setPrice(30000 * 10**8); // $30,000
      await pythOracle.setPrice(30000 * 10**8); // $30,000
    });

    it("Should revert when adding liquidity with incorrect token ratio", async function () {
      const usdtAmount = ethers.utils.parseEther("30000");
      const tokenAmount = ethers.utils.parseEther("0.5"); // Too low amount for the price

      await expect(
        wrapper.connect(user).addLiquidityWithBothTokens(usdtAmount, tokenAmount)
      ).to.be.revertedWith("Token ratio outside acceptable range");
    });

    it("Should revert when tokens not approved", async function () {
      const usdtAmount = ethers.utils.parseEther("30000");
      const tokenAmount = ethers.utils.parseEther("1.0");

      await token.connect(user).approve(wrapper.address, 0);
      await expect(
        wrapper.connect(user).addLiquidityWithBothTokens(usdtAmount, tokenAmount)
      ).to.be.revertedWith("Insufficient token allowance");
    });

    it("Should revert when amounts are zero", async function () {
      await expect(
        wrapper.connect(user).addLiquidityWithBothTokens(0, 0)
      ).to.be.revertedWith("Amounts must be greater than 0");
    });

    it("Should transfer tokens from user", async function () {
      const usdtAmount = ethers.utils.parseEther("30000");
      const tokenAmount = ethers.utils.parseEther("1.0");

      const usdtBalanceBefore = await usdt.balanceOf(user.address);
      const tokenBalanceBefore = await token.balanceOf(user.address);

      await wrapper.connect(user).addLiquidityWithBothTokens(usdtAmount, tokenAmount);

      const usdtBalanceAfter = await usdt.balanceOf(user.address);
      const tokenBalanceAfter = await token.balanceOf(user.address);

      expect(usdtBalanceBefore.sub(usdtBalanceAfter)).to.equal(usdtAmount);
      expect(tokenBalanceBefore.sub(tokenBalanceAfter)).to.equal(tokenAmount);
    });

    it("Should allow small price deviations within threshold", async function () {
      const usdtAmount = ethers.utils.parseEther("30000");
      const tokenAmount = ethers.utils.parseEther("1.0");
      
      // Set slightly different prices in oracles (within 2% threshold)
      await chainlinkOracle.setPrice(29500 * 10**8); // -1.67%
      await pythOracle.setPrice(30500 * 10**8);   // +1.67%

      // Should not revert
      await expect(
        wrapper.connect(user).addLiquidityWithBothTokens(usdtAmount, tokenAmount)
      ).to.not.be.reverted;
    });

    it("Should handle minimum amounts", async function () {
      const usdtAmount = ethers.utils.parseEther("0.000001"); // Very small USDT amount
      const tokenAmount = ethers.utils.parseEther("0.0000000000333333"); // Equivalent token amount

      await expect(
        wrapper.connect(user).addLiquidityWithBothTokens(usdtAmount, tokenAmount)
      ).to.not.be.reverted;
    });

    it("Should handle maximum amounts", async function () {
      const usdtAmount = ethers.utils.parseEther("1000000"); // 1M USDT
      const tokenAmount = ethers.utils.parseEther("33.333333"); // Equivalent token amount

      await expect(
        wrapper.connect(user).addLiquidityWithBothTokens(usdtAmount, tokenAmount)
      ).to.not.be.reverted;
    });

    it("Should handle multiple consecutive additions", async function () {
      const usdtAmount = ethers.utils.parseEther("30000");
      const tokenAmount = ethers.utils.parseEther("1.0");

      // Add liquidity multiple times
      await wrapper.connect(user).addLiquidityWithBothTokens(usdtAmount, tokenAmount);
      await wrapper.connect(user).addLiquidityWithBothTokens(usdtAmount, tokenAmount);
      await wrapper.connect(user).addLiquidityWithBothTokens(usdtAmount, tokenAmount);

      // Check final balances
      const finalUsdtBalance = await usdt.balanceOf(user.address);
      const finalTokenBalance = await token.balanceOf(user.address);
      
      const expectedUsdtBalance = ethers.utils.parseEther("1000000").sub(usdtAmount.mul(3));
      const expectedTokenBalance = ethers.utils.parseEther("1000").sub(tokenAmount.mul(3));
      
      expect(finalUsdtBalance).to.equal(expectedUsdtBalance);
      expect(finalTokenBalance).to.equal(expectedTokenBalance);
    });

    it("Should revert when price deviation exceeds threshold", async function () {
      const usdtAmount = ethers.utils.parseEther("30000");
      const tokenAmount = ethers.utils.parseEther("1.0");
      
      // Set prices with more than 2% difference (using 10% difference)
      await chainlinkOracle.setPrice(27000 * 10**8); // -10%
      await pythOracle.setPrice(33000 * 10**8);   // +10%

      await expect(
        wrapper.connect(user).addLiquidityWithBothTokens(usdtAmount, tokenAmount)
      ).to.be.revertedWith("Token ratio outside acceptable range");
    });
  });

  describe("Access Control", function () {
    it("Should only allow owner to update Chainlink oracle", async function () {
      const newAddress = ethers.Wallet.createRandom().address;

      await expect(
        wrapper.connect(otherUser).setChainlinkOracle(newAddress)
      ).to.be.revertedWith("OwnableUnauthorizedAccount");

      await expect(
        wrapper.connect(owner).setChainlinkOracle(newAddress)
      ).to.not.be.reverted;

      expect(await wrapper.chainlinkOracle()).to.equal(newAddress);
    });

    it("Should only allow owner to update Pyth oracle", async function () {
      const newAddress = ethers.Wallet.createRandom().address;

      await expect(
        wrapper.connect(otherUser).setPythOracle(newAddress)
      ).to.be.revertedWith("OwnableUnauthorizedAccount");

      await expect(
        wrapper.connect(owner).setPythOracle(newAddress)
      ).to.not.be.reverted;

      expect(await wrapper.pythOracle()).to.equal(newAddress);
    });

    it("Should not allow setting oracle to zero address", async function () {
      await expect(
        wrapper.connect(owner).setChainlinkOracle(ethers.constants.AddressZero)
      ).to.be.revertedWith("Invalid oracle address");

      await expect(
        wrapper.connect(owner).setPythOracle(ethers.constants.AddressZero)
      ).to.be.revertedWith("Invalid oracle address");
    });

    it("Should emit events when updating oracles", async function () {
      const newAddress = ethers.Wallet.createRandom().address;

      await expect(wrapper.connect(owner).setChainlinkOracle(newAddress))
        .to.emit(wrapper, "ChainlinkOracleUpdated")
        .withArgs(chainlinkOracle.address, newAddress);

      await expect(wrapper.connect(owner).setPythOracle(newAddress))
        .to.emit(wrapper, "PythOracleUpdated")
        .withArgs(pythOracle.address, newAddress);
    });

    it("Should maintain owner after oracle updates", async function () {
      const newAddress = ethers.Wallet.createRandom().address;
      
      await wrapper.connect(owner).setChainlinkOracle(newAddress);
      await wrapper.connect(owner).setPythOracle(newAddress);
      
      expect(await wrapper.owner()).to.equal(owner.address);
    });
  });
  describe("MockPythOracle", function () {
    let oracle: MockPythOracle;

    beforeEach(async function () {
        const MockPythOracleFactory = (await ethers.getContractFactory(
            "MockPythOracle"
        )) as MockPythOracle__factory;
        oracle = await MockPythOracleFactory.deploy();
        await oracle.deployed();
        await oracle.setPrice(ethers.BigNumber.from(30000).mul(ethers.BigNumber.from(10).pow(8)));
    });

    it("should return the initial price", async function () {
        const price = await oracle.getPriceUnsafe(ethers.constants.HashZero);
        const expectedPrice = ethers.BigNumber.from(30000).mul(ethers.BigNumber.from(10).pow(8));
        expect(price.price).to.equal(expectedPrice);
    });

    it("should update the price", async function () {
        const newPrice = ethers.BigNumber.from(35000).mul(ethers.BigNumber.from(10).pow(8));
        await oracle.setPrice(newPrice);
        const price = await oracle.getPriceUnsafe(ethers.constants.HashZero);
        expect(price.price).to.equal(newPrice);
    });

    it("should return the correct exponent and confidence interval", async function () {
        const price = await oracle.getPriceUnsafe(ethers.constants.HashZero);
        expect(price.expo).to.equal(-8);
        expect(price.conf).to.equal(0);
    });

    it("should return the correct EMA price", async function () {
        const price = await oracle.getEmaPriceUnsafe(ethers.constants.HashZero);
        expect(price.expo).to.equal(-8);
        expect(price.conf).to.equal(0);
    });

    it("should revert when calling getPrice", async function () {
        await expect(oracle.getPrice(ethers.constants.HashZero)).to.be.revertedWith("Not implemented");
    });

    it("should revert when calling getEmaPrice", async function () {
        await expect(oracle.getEmaPrice(ethers.constants.HashZero)).to.be.revertedWith("Not implemented");
    });

    it("should revert when calling getPriceNoOlderThan", async function () {
        await expect(oracle.getPriceNoOlderThan(ethers.constants.HashZero, 0)).to.be.revertedWith("Not implemented");
    });

    it("should revert when calling getEmaPriceNoOlderThan", async function () {
        await expect(oracle.getEmaPriceNoOlderThan(ethers.constants.HashZero, 0)).to.be.revertedWith("Not implemented");
    });

    it("should revert when calling getPriceUpdateData", async function () {
        await expect(oracle.getPriceUpdateData(ethers.constants.HashZero)).to.be.revertedWith("Not implemented");
    });

    it("should return zero update fee", async function () {
        const fee = await oracle.getUpdateFee([]);
        expect(fee).to.equal(0);
    });

    it("should not revert when calling updatePriceFeeds", async function () {
        await expect(oracle.updatePriceFeeds([])).to.not.be.reverted;
    });

    it("should not revert when calling updatePriceFeedsIfNecessary", async function () {
        await expect(oracle.updatePriceFeedsIfNecessary([], [], [])).to.not.be.reverted;
    });

    it("should return empty array when parsing price feed updates", async function () {
        const tx = await oracle.parsePriceFeedUpdates([], [], 0, 0);
        await tx.wait();
    });

    it("should return empty array when parsing unique price feed updates", async function () {
      const updateData: string[] = [];
      const priceIds: string[] = [];
      const minPublishTime = 0;
      const maxPublishTime = Math.floor(Date.now() / 1000);
      
      const result = await oracle.parsePriceFeedUpdatesUnique(updateData, priceIds, minPublishTime, maxPublishTime);
      expect(result).to.deep.equal([]);
    });

    it("should return the correct valid time period", async function () {
        const validTimePeriod = await oracle.getValidTimePeriod();
        expect(validTimePeriod).to.equal(3600);
    });
  });

  describe("MockChainlinkOracle", function () {
    let oracle: any;

    beforeEach(async function () {
        const MockChainlinkOracle = await ethers.getContractFactory("MockChainlinkOracle");
        oracle = await MockChainlinkOracle.deploy();
        await oracle.deployed();
        await oracle.setPrice(ethers.BigNumber.from(30000).mul(ethers.BigNumber.from(10).pow(8)));
    });

    it("should have an initial price of $30,000 with 8 decimals", async function () {
        const result = await oracle.latestRoundData();
        const price = result.answer;
        const expected = ethers.BigNumber.from(30000).mul(ethers.BigNumber.from(10).pow(8));
        expect(price).to.equal(expected);
    });

    it("should update the price to $35,000 with 8 decimals", async function () {
        const newPrice = ethers.BigNumber.from(35000).mul(ethers.BigNumber.from(10).pow(8));
        await oracle.setPrice(newPrice);
        const result = await oracle.latestRoundData();
        const price = result.answer;
        expect(price).to.equal(newPrice);
    });

    it("should return 8 decimals", async function () {
        const decimals = await oracle.decimals();
        expect(decimals).to.equal(8);
    });

    it("should return description 'BTC/USD'", async function () {
        const description = await oracle.description();
        expect(description).to.equal("BTC/USD");
    });

    it("should return version 1", async function () {
        const version = await oracle.version();
        expect(version).to.equal(1);
    });

    it("should return round data with default values", async function () {
        const roundId = 1;
        const result = await oracle.getRoundData(roundId);
        expect(result.roundId).to.equal(roundId);
        expect(result.answer).to.equal(0);
        expect(result.startedAt).to.equal(0);
        expect(result.updatedAt).to.equal(0);
        expect(result.answeredInRound).to.equal(0);
    });

    it("should update the price multiple times", async function () {
        const prices = [
            ethers.BigNumber.from(32000).mul(ethers.BigNumber.from(10).pow(8)),
            ethers.BigNumber.from(33000).mul(ethers.BigNumber.from(10).pow(8)),
            ethers.BigNumber.from(34000).mul(ethers.BigNumber.from(10).pow(8)),
        ];
        for (const newPrice of prices) {
            await oracle.setPrice(newPrice);
            const result = await oracle.latestRoundData();
            const price = result.answer;
            expect(price).to.equal(newPrice);
        }
    });

    it("should handle large price values", async function () {
        const largePrice = ethers.BigNumber.from(1000000).mul(ethers.BigNumber.from(10).pow(8));
        await oracle.setPrice(largePrice);
        const result = await oracle.latestRoundData();
        const price = result.answer;
        expect(price).to.equal(largePrice);
    });

    it("should handle negative price values", async function () {
        const negativePrice = ethers.BigNumber.from(-10000).mul(ethers.BigNumber.from(10).pow(8));
        await oracle.setPrice(negativePrice);
        const result = await oracle.latestRoundData();
        const price = result.answer;
        expect(price).to.equal(negativePrice);
    });
  });

});
