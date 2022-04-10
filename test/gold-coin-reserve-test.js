const {
    expect
} = require("chai");
const {
    ethers
} = require("hardhat");

const INITIAL_TOTAL_SUPPLY = 3e6; // 3M tokens

async function advanceBlocks() {
    await ethers.provider.send('evm_mine');
}

describe("GoldCoinReserve", function() {
    beforeEach(async function() {
        signers = await ethers.getSigners();

        this.owner = signers[0];
        this.user1 = signers[1];
        this.user2 = signers[2];
        const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

        GCR = await ethers.getContractFactory('GoldCoinReserve');
        this.old_gcr = await GCR.deploy(ZERO_ADDRESS);
        this.old_gcr.deployed();
        this.gcr = await GCR.deploy(this.old_gcr.address);
        await this.gcr.deployed();
    });

    it("Should mint initial tokens", async function() {
        expect((await this.gcr.totalSupply()).toString()).
        to.equal(ethers.utils.parseEther(INITIAL_TOTAL_SUPPLY.toString()));
    });

    it("Should mint tokens", async function() {
        expect(await this.gcr.connect(this.owner).mint(this.user1.address, '1000')).to.emit("Transfer");
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('1000');
    });

    it('Should not allow mint by non-owner', async function() {
        await expect(this.gcr.connect(this.user1).mint(this.user2.address, '1000')).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should be able to transfer tokens', async function() {
        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '10000')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('10000');
    });

    it('Should set transfer limits', async function() {
        await expect(this.gcr.connect(this.user1).setTransferLimit('30000')).to.be.revertedWith('Ownable: caller is not the owner');
        expect(await this.gcr.connect(this.owner).setTransferLimit('30000')).to.emit('TransferLimitSet');
        expect((await this.gcr.transferLimit()).toString()).to.equal('30000');
    });

    it('Should obey transfer limits', async function() {
        expect(this.gcr.connect(this.owner).setTransferLimit('30000')).to.emit('TransferLimitSet');
        // Try with > limit
        await expect(this.gcr.connect(this.owner).transfer(this.user1.address, '30001')).to.be.revertedWith('GCR: daily limit exceeds');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('0');
        // Try within the limit
        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '10000')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('10000');
        // Try within the limit
        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '10000')).to.emit('Transfer1');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('20000');

        // Try with that exceeds the total tranfer per day
        await expect(this.gcr.connect(this.owner).transfer(this.user1.address, '10001')).to.be.revertedWith('GCR: daily limit exceeds');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('20000');

        // Advance blocks 
        for (i = 0; i < 120; i++) {
            advanceBlocks();
        }

        // make sure it passes after the limit period
        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '10001')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('30001');
        // Sending another 20999 should succeed
        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '19999')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('50000');
        for (i = 0; i < 60; i++) {
            advanceBlocks();
        }

        // Should not be able to transfer even single token after this
        await expect(this.gcr.connect(this.owner).transfer(this.user1.address, '1')).to.be.revertedWith('GCR: daily limit exceeds');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('50000');

        // Advance by 120 seconds and try
        for (i = 0; i < 60; i++) {
            advanceBlocks();
        }
        // Owner should be able to transfer now
        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '1')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('50001');

        // Transfer more than limit and see it fails
        await expect(this.gcr.connect(this.owner).transfer(this.user1.address, '30001')).to.be.revertedWith('GCR: daily limit exceeds');
        await expect(this.gcr.connect(this.owner).transfer(this.user1.address, '30000')).to.be.revertedWith('GCR: daily limit exceeds');

        // But, another user should be able to transfer
        expect(await this.gcr.connect(this.user1).transfer(this.user2.address, '30000')).to.emit('Transfer');

        // Owner should be able to transfer upto 29999
        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '29999')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('50000');

        // User1 should not be able to transfer now
        await expect(this.gcr.connect(this.user1).transfer(this.user1.address, '1')).to.be.revertedWith('GCR: daily limit exceeds');

        // User1 Should be able to transfer again after 120 seconds
        // Advance by 120 seconds and try
        for (i = 0; i < 120; i++) {
            advanceBlocks();
        }
        expect(await this.gcr.connect(this.user1).transfer(this.user2.address, '1')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('30001');

        // User1 can transfer only upto 29999
        await expect(this.gcr.connect(this.user1).transfer(this.user1.address, '30000')).to.be.revertedWith('GCR: daily limit exceeds');
        expect(await this.gcr.connect(this.user1).transfer(this.user2.address, '29999')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('60000');

        // Remove the limit and see no transfer limits apply
        await this.gcr.setTransferLimit(0);
        expect(await this.gcr.connect(this.owner).transfer(this.user2.address, '50000')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user2.address)).toString()).to.equal('110000');
    });

    it('Should allow token burning', async function() {
        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '70000')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('70000');

        // Burn from user1
        expect(await this.gcr.connect(this.user1).burn('50000')).to.emit('Transfer');

        // Test transfer limits don't affect the burns
        await this.gcr.setTransferLimit(30000);
        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '30000')).to.emit('Transfer');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('50000');

        // Burn from user1
        expect(await this.gcr.connect(this.user1).burn('50000')).to.emit('Transfer');
    });

    it('Should be able to whitelist', async function() {
        await this.gcr.whitelistAccount(this.owner.address);
        expect(await this.gcr.isWhitelisted(this.owner.address)).to.be.true;

        await this.gcr.whitelistAccount(this.user1.address);
        expect(await this.gcr.isWhitelisted(this.user1.address)).to.be.true;

        expect(await this.gcr.isWhitelisted(this.user2.address)).to.be.false;

        await this.gcr.unWhitelistAccount(this.user1.address);
        expect(await this.gcr.isWhitelisted(this.user1.address)).to.be.false;

        await this.gcr.whitelistAccount(this.user2.address);
        expect(await this.gcr.isWhitelisted(this.user2.address)).to.be.true;
    });

    it('Should obey white list', async function() {
        expect(this.gcr.connect(this.owner).setTransferLimit('30000')).to.emit('TransferLimitSet');
        // Try with > limit
        await expect(this.gcr.connect(this.owner).transfer(this.user1.address, '30001')).to.be.revertedWith('GCR: daily limit exceeds');

        // Add 'from' to whitelist and try
        await this.gcr.whitelistAccount(this.owner.address);
        expect(await this.gcr.isWhitelisted(this.owner.address)).to.be.true;

        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '30001')).to.emit('Transfer');

        // Try with > limit
        await expect(this.gcr.connect(this.user1).transfer(this.user2.address, '30001')).to.be.revertedWith('GCR: daily limit exceeds');
        // Add 'to' to whitelist and try
        await this.gcr.whitelistAccount(this.user2.address);
        expect(await this.gcr.connect(this.user1).transfer(this.user2.address, '30001')).to.emit('Transfer');

        // Remove from whitelist and try, it should fail
        await this.gcr.unWhitelistAccount(this.user2.address);
        await expect(this.gcr.connect(this.user1).transfer(this.user2.address, '30001')).to.be.revertedWith('GCR: daily limit exceeds');

        // Test adding both the address to whitelist, it should pass
        await this.gcr.whitelistAccount(this.user1.address);
        expect(await this.gcr.connect(this.owner).transfer(this.user1.address, '30001')).to.emit('Transfer');
    });

    it('Should allow swapping old GCR', async function() {
        await this.old_gcr.transfer(this.user1.address, '50000');

        await this.old_gcr.connect(this.user1).approve(this.gcr.address, '50000');
        await this.gcr.transfer(this.gcr.address, '100000');

        expect(await this.gcr.connect(this.user1).swapOldGCR('50000')).to.emit('SwappedOldGCR');
        expect((await this.gcr.balanceOf(this.user1.address)).toString()).to.equal('50000');
        expect((await this.old_gcr.balanceOf(this.gcr.address)).toString()).to.equal('50000');
        expect((await this.gcr.balanceOf(this.gcr.address)).toString()).to.equal('50000');
        expect((await this.old_gcr.balanceOf(this.user1.address)).toString()).to.equal('0');
        await expect(this.gcr.connect(this.user1).swapOldGCR('50000')).to.be.revertedWith('GCR: not enough old GCR tokens');
    });
});