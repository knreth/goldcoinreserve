const {
    expect
} = require("chai");
const {
    ethers
} = require("hardhat");


const BRONZE = "bronze";

async function advanceBlocks() {
    await ethers.provider.send('evm_mine');
}

describe("GCRStaking", function() {
    beforeEach(async function() {
        signers = await ethers.getSigners();

        this.owner = signers[0];
        this.user1 = signers[1];
        this.user2 = signers[2];
        const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

        GCR = await ethers.getContractFactory('GoldCoinReserve');
        this.gcr = await GCR.deploy(ZERO_ADDRESS);
        await this.gcr.deployed();

        await this.gcr.transfer(this.user1.address, '500000');

        Staking = await ethers.getContractFactory('GCRStaking');


        this.staking = await Staking.deploy(this.gcr.address, this.user1.address);
        await this.staking.deployed();

        await this.gcr.connect(this.user1).approve(this.staking.address, '500000');
    });

    it('should be able to stake in normal plan', async function() {
        await this.staking.createPlan(BRONZE, '1000', '30', '1000', 0);

        await this.gcr.transfer(this.user2.address, '100000');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('100000');

        // Enter staking
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        await this.staking.connect(this.user2).enterStaking('10000', BRONZE);
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('90000');
    });

    it('should be able to withdraw from normal plan', async function() {
        await this.staking.createPlan(BRONZE, '1000', '30', '1000', 0);

        await this.gcr.transfer(this.user2.address, '100000');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('100000');

        // Enter staking
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', BRONZE)).to.emit('Staked');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('90000');

        await expect(this.staking.connect(this.user2).withdrawStaking('0')).to.be.revertedWith('GCRStaking: plan not yet vested');

        for (i = 0; i < 30; i++) {
            advanceBlocks();
        }

        expect(await this.staking.connect(this.user2).withdrawStaking('0')).to.emit('StakeWithdrawn');

        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('101000');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('499000');
    });

    it('should be able to withdraw from vesting plan', async function() {
        await this.staking.createPlan(BRONZE, '1000', '60', '1000', '30');

        await this.gcr.transfer(this.user2.address, '100000');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('100000');

        // Enter staking
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', BRONZE)).to.emit('Staked');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('90000');

        await expect(this.staking.connect(this.user2).withdrawStaking('0')).to.be.revertedWith('GCRStaking: plan not yet vested');

        for (i = 0; i < 30; i++) {
            advanceBlocks();
        }

        // Should withdraw half of the staked amount and reward amount
        expect(await this.staking.connect(this.user2).withdrawStaking('0')).to.emit('StakeWithdrawn');

        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('95500');

        // Try again to withdraw remaining, it should fail
        await expect(this.staking.connect(this.user2).withdrawStaking('0')).to.be.revertedWith('GCRStaking: plan not yet vested');

        // Advance the block and try
        for (i = 0; i < 30; i++) {
            advanceBlocks();
        }

        expect(await this.staking.connect(this.user2).withdrawStaking('0')).to.emit('StakeWithdrawn');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('101000');

        // Try again after the stake completely withdrwan, it should fail.
        await expect(this.staking.connect(this.user2).withdrawStaking('0')).to.be.revertedWith('GCRStaking: stake is not active');

        // Enter stake again
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', BRONZE)).to.emit('Staked');

        // This time wait until full meture time is over
        for (i = 0; i < 60; i++) {
            advanceBlocks();
        }

        // Should be able to withdraw complete amount
        expect(await this.staking.connect(this.user2).withdrawStaking('0')).to.emit('StakeWithdrawn');

        // Enter stake again
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', BRONZE)).to.emit('Staked');

        // This time wait until 1 and half time of the vesting period
        for (i = 0; i < 45; i++) {
            advanceBlocks();
        }

        // Should be able to withdraw only half amount
        expect(await this.staking.connect(this.user2).withdrawStaking('0')).to.emit('StakeWithdrawn');

        // this time we should be able to withdraw just after 15 
        for (i = 0; i < 15; i++) {
            advanceBlocks();
        }

        expect(await this.staking.connect(this.user2).withdrawStaking('0')).to.emit('StakeWithdrawn');

        // Enter stake again
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', BRONZE)).to.emit('Staked');

        // This time wait more than the meture time
        for (i = 0; i < 90; i++) {
            advanceBlocks();
        }

        // Should be able to withdraw full amount
        expect(await this.staking.connect(this.user2).withdrawStaking('0')).to.emit('StakeWithdrawn');

        // Try with some odd amount
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('1777', BRONZE)).to.emit('Staked');

        // This time wait more than the meture time
        for (i = 0; i < 30; i++) {
            advanceBlocks();
        }

        // Should be able to withdraw half amount
        expect(await this.staking.connect(this.user2).withdrawStaking('0')).to.emit('StakeWithdrawn');

        // This time wait more than the meture time
        for (i = 0; i < 30; i++) {
            advanceBlocks();
        }
        expect(await this.staking.connect(this.user2).withdrawStaking('0')).to.emit('StakeWithdrawn');
    });

    it('should allow emergency withdraw', async function() {
        await this.staking.createPlan(BRONZE, '1000', '60', '1000', '30');

        await this.gcr.transfer(this.user2.address, '100000');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('100000');

        // Enter staking
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', BRONZE)).to.emit('Staked');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('90000');
        expect((await this.gcr.balanceOf(this.staking.address)).toString()).to.equal('11000');

        // emergency withdraw
        expect(await this.staking.connect(this.user2).emergencyWithdraw('0')).to.emit('EmergencyWithdraw');

        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('100000');

        expect((await this.gcr.balanceOf(this.staking.address)).toString()).to.equal('1000');

        await expect(this.staking.connect(this.user2).withdrawStaking(0)).to.be.revertedWith('GCRStaking: stake is not active');

        // emergency withdraw, should revert as the stake was deleted
        await expect(this.staking.connect(this.user2).emergencyWithdraw('0')).to.be.revertedWith('GCRStaking: stake is not active');

        // Do withdraw excess reward amount
        await this.staking.transferExcessReward(this.user2.address);
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('101000');
        expect((await this.gcr.balanceOf(this.staking.address)).toString()).to.equal('0');
        await this.staking.transferExcessReward(this.user2.address);
    });

    it('should be able to pause the staking', async function() {
        await this.staking.createPlan(BRONZE, '1000', '60', '1000', '0');

        await this.gcr.transfer(this.user2.address, '100000');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('100000');

        // Enter staking
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', BRONZE)).to.emit('Staked');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('90000');
        expect((await this.gcr.balanceOf(this.staking.address)).toString()).to.equal('11000');

        expect(await this.staking.stakingPaused()).to.be.false;

        // pause the staking and try enter staking again
        await this.staking.pauseStaking();
        expect(await this.staking.stakingPaused()).to.be.true;

        // try staking
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        await expect(this.staking.connect(this.user2).enterStaking('10000', BRONZE)).to.be.revertedWith('GCRStaking: staking paused');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('90000');
        expect((await this.gcr.balanceOf(this.staking.address)).toString()).to.equal('11000');

        // should be able to withdraw the staking in pause state
        for (i = 0; i < 60; i++)
            advanceBlocks();

        expect(await this.staking.connect(this.user2).withdrawStaking(0)).to.emit('StakeWithdrawn');

        // Resume staking and do stake
        await this.staking.resumeStaking();
        expect(await this.staking.stakingPaused()).to.be.false;

        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', BRONZE)).to.emit('Staked');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('91000');
        expect((await this.gcr.balanceOf(this.staking.address)).toString()).to.equal('11000');
    });

    it('update global variables properly', async function() {
        expect((await this.staking.totalStakedAmount()).toString()).to.equal('0');
        expect((await this.staking.totalPendingRewardAmount()).toString()).to.equal('0');
        expect((await this.staking.totalRewardAmountClaimed()).toString()).to.equal('0');

        await this.staking.createPlan(BRONZE, '1000', '60', '1000', '0');

        await this.gcr.transfer(this.user2.address, '100000');

        // Enter staking
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', BRONZE)).to.emit('Staked');

        expect((await this.staking.totalStakedAmount()).toString()).to.equal('10000');
        expect((await this.staking.totalPendingRewardAmount()).toString()).to.equal('1000');
        expect((await this.staking.totalRewardAmountClaimed()).toString()).to.equal('0');

        for (i = 0; i < 60; i++)
            advanceBlocks();

        expect(await this.staking.connect(this.user2).withdrawStaking(0)).to.emit('StakeWithdrawn');
        expect((await this.staking.totalStakedAmount()).toString()).to.equal('0');
        expect((await this.staking.totalPendingRewardAmount()).toString()).to.equal('0');
        expect((await this.staking.totalRewardAmountClaimed()).toString()).to.equal('1000');

        await this.staking.createPlan("test", '1000', '60', '1000', '30');
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', 'test')).to.emit('Staked');

        expect((await this.staking.totalStakedAmount()).toString()).to.equal('10000');
        expect((await this.staking.totalPendingRewardAmount()).toString()).to.equal('1000');
        expect((await this.staking.totalRewardAmountClaimed()).toString()).to.equal('1000');

        for (i = 0; i < 30; i++)
            advanceBlocks();

        expect(await this.staking.connect(this.user2).withdrawStaking(0)).to.emit('StakeWithdrawn');

        expect((await this.staking.totalStakedAmount()).toString()).to.equal('5000');
        expect((await this.staking.totalPendingRewardAmount()).toString()).to.equal('500');
        expect((await this.staking.totalRewardAmountClaimed()).toString()).to.equal('1500');

        for (i = 0; i < 30; i++)
            advanceBlocks();

        expect(await this.staking.connect(this.user2).withdrawStaking(0)).to.emit('StakeWithdrawn');
        expect((await this.staking.totalStakedAmount()).toString()).to.equal('0');
        expect((await this.staking.totalPendingRewardAmount()).toString()).to.equal('0');
        expect((await this.staking.totalRewardAmountClaimed()).toString()).to.equal('2000');
    });

    it('should be able to provide pools/stakes info', async function() {
        await this.staking.createPlan("test1", '1000', '60', '1000', '0');
        await this.staking.createPlan("test2", '1000', '90', '1000', '0');
        await this.staking.createPlan("test3", '1000', '120', '1000', '0');
        await this.staking.createPlan("test4", '1000', '360', '1000', '30');

        plans = await this.staking.getPlanInfo('test1');
        expect(plans['duration'].toString()).to.equal('60');

        plans = await this.staking.getPlanInfo('test2');
        expect(plans['duration'].toString()).to.equal('90');

        plans = await this.staking.getPlanInfo('test3');
        expect(plans['duration'].toString()).to.equal('120');
        expect(plans['vestingPeriod'].toString()).to.equal('120');

        plans = await this.staking.getPlanInfo('test4');
        expect(plans['duration'].toString()).to.equal('360');
        expect(plans['vestingPeriod'].toString()).to.equal('30');

        await this.gcr.transfer(this.user2.address, '100000');

        // Enter staking
        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('10000', "test1")).to.emit('Staked');

        expect((await this.staking.getStakedAmountByPlan("test1")).toString()).to.equal('10000');
        expect((await this.staking.getUserStakedAmount(this.user2.address)).toString()).to.be.equal('10000');

        await this.gcr.connect(this.user2).approve(this.staking.address, '10000');
        expect(await this.staking.connect(this.user2).enterStaking('5000', "test2")).to.emit('Staked');
        expect((await this.staking.getUserStakedAmount(this.user2.address)).toString()).to.be.equal('15000');

        indices = await this.staking.getStakesIndexes(this.user2.address);
        expect(indices['numStakes'].toString()).to.be.equal('2');

        info = await this.staking.getStakeInfo(this.user2.address, '0');
        expect(info['stakeAmount'].toString()).to.be.equal('10000');
        expect(info['rewardAmount'].toString()).to.be.equal('1000');

        info = await this.staking.getStakeInfo(this.user2.address, '1');
        expect(info['stakeAmount'].toString()).to.be.equal('5000');
        expect(info['rewardAmount'].toString()).to.be.equal('500');
    });
});
