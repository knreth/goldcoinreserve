// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Gold Coin Reserve Staking
 */
contract GCRStaking is Ownable {
    // maximum number of stakes from a wallet
    uint256 public constant MAX_NUM_OF_STAKES_PER_USER = 5;

    // GCR Token contract Address
    address public gcrToken;
    // GCR account from which reward amount will be sent to stakeholders
    address public rewardAccount;
    // total staked amount, from all stakeholders
    uint256 public totalStakedAmount;
    // reward amount pending to be rewarded to all stakeholders
    uint256 public totalPendingRewardAmount;
    // reward amount transfered to all stakeholders
    uint256 public totalRewardAmountClaimed;
    // whether staking has been paused
    bool public stakingPaused;

    struct Plan {
        string name; // plan name
        uint256 rewardPercent; // percentage of reward
        uint256 minimumStake; // minimum stake amount
        uint256 durationInDays; // plan number of days
        uint256 stakedAmount; // total staked amount in the plan
        uint256 usageCount; // how many stakes are in active on this plan
        uint256 vestingPeriod; // vesting period in number of days
        uint8 state; // state of the plan, 0 - Not Created, 1 - Active, 2 - Disabled
    }

    struct Stake {
        uint256 createdAt; // timestamp when the stake was created
        uint256 stakedAmount; // staked amount
        uint256 rewardAmount; // calculated reward amount, will be transfered to stake holder after plan expiry
        uint256 vestingAmount; // vesting amount for each vesting time
        uint256 vestingReward; // rewards per each vesting
        uint256 lastVestingTime; // last vesting time
        uint8 state; // state of the stake, 0 - FREE, 1 - ACTIVE
        string plan;
    }

    // The stakes of each stakeholder.
    mapping(address => Stake[MAX_NUM_OF_STAKES_PER_USER]) internal stakes;

    // List of plans, indexed with plan name.
    mapping(string => Plan) private plans;

    /**
     * @notice emitted when a new plan is created
     * @param name name of the plan
     * @param duration duration of the plan in days
     * @param rewardPercentage percent of reward given.
     */
    event PlanCreated(string name, uint256 duration, uint256 rewardPercentage);
    /**
     * @notice emitted when a plan is deleted
     * @param name of the plan
     */
    event PlanDeleted(string name);
    /**
     * @notice emitted when a user enters into a stake
     * @param user staker address
     * @param plan name of the plan in which user staked
     * @param stakeAmount amount of tokens staked
     * @param rewardAmount reward amount the user receives after the plan meturity
     */
    event Staked(address user, string plan, uint256 stakeAmount, uint256 rewardAmount);
    /**
     * @notice emitted when a user withdraws from a staking
     * @param stakeIndex index of the stake
     * @param vestedAmount amount of stakedAmount withdrawn.
     * @param vestedReward amount of rewards withdrawn
     */
    event StakeWithdrawn(uint256 stakeIndex, uint256 vestedAmount, uint256 vestedReward);
    /**
     * @notice emitted when a user performs emergency withdraw
     * @param user staker address
     * @param stakeIndex index of the stake
     */
    event EmergencyWithdraw(address user, uint256 stakeIndex);

    constructor(address _gcrToken, address _rewardsFrom) {
        require(_gcrToken != address(0), "GCRStaking: invalid gcr token");
        require(_rewardsFrom != address(0), "GCRStaking: invalid reward account");
        gcrToken = _gcrToken;
        rewardAccount = _rewardsFrom;
    }

    /**
     * @notice enter the stake, called by user to stake tokens in a plan
     * @param _stakeAmount amount of tokens to stake
     * @param _plan name of the plan to stake in
     */
    function enterStaking(uint256 _stakeAmount, string calldata _plan) external {
        bool status;
        uint256 i;
        uint256 rewardAmount;

        require(!stakingPaused, "GCRStaking: staking paused");

        Plan storage plan = plans[_plan];

        /* plan must be valid and should not be disabled for further stakes */
        require(plan.state == 1, "GCRStaking: invalid plan or disabled");

        require(_stakeAmount >= plan.minimumStake, "GCRStaking: amount is below the minimum allowed");

        /* A stack holder can stake upto MAX_NUM_OF_STAKES_PER_USER of stakes at any point of time */
        for (i = 0; i < MAX_NUM_OF_STAKES_PER_USER; i++) {
            if (stakes[msg.sender][i].state == 0) break;
        }

        require(i < MAX_NUM_OF_STAKES_PER_USER, "GCRStaking: reached maximum stakes per user");

        Stake storage stake = stakes[msg.sender][i];

        stake.state = 1; // Stake is active

        // Calculate reward and get it from reward account
        rewardAmount = (_stakeAmount * plan.rewardPercent) / 10000;

        stake.plan = _plan;
        stake.rewardAmount = rewardAmount;
        stake.createdAt = block.timestamp;
        stake.stakedAmount = _stakeAmount;

        uint256 numVestings = plan.durationInDays / plan.vestingPeriod;

        stake.vestingAmount = _stakeAmount / numVestings;
        stake.vestingReward = rewardAmount / numVestings;

        stake.lastVestingTime = block.timestamp;

        totalStakedAmount += _stakeAmount;
        totalPendingRewardAmount += rewardAmount;

        plan.stakedAmount += _stakeAmount;

        /* Increase the usage count of this plan */
        plan.usageCount++;

        emit Staked(msg.sender, _plan, _stakeAmount, rewardAmount);

        // Transfer tokens from stake holders GCR account to this contract account
        status = IERC20(gcrToken).transferFrom(msg.sender, address(this), _stakeAmount);
        require(status, "GCRStaking: transfer from user account failed");

        if (rewardAmount > 0) {
            status = IERC20(gcrToken).transferFrom(rewardAccount, address(this), rewardAmount);
            require(status, "GCRStaking: failed to transfer from");
        }
    }

    /**
     * @notice withdraw/leave staking.
     * @param _stakeIndex stake index to withdraw
     */
    function withdrawStaking(uint256 _stakeIndex) external {
        uint256 vestingAmount;
        uint256 rewardAmount;
        bool status;

        require(_stakeIndex < MAX_NUM_OF_STAKES_PER_USER, "GCRStaking: invalid stake index");

        Stake storage stake = stakes[msg.sender][_stakeIndex];
        require(stake.state == 1, "GCRStaking: stake is not active");
        Plan storage plan = plans[stake.plan];

        (vestingAmount, rewardAmount) = _calculateVestingAmount(stake, plan);

        require(vestingAmount > 0, "GCRStaking: plan not yet metured");

        stake.stakedAmount -= vestingAmount;
        stake.rewardAmount -= rewardAmount;

        uint256 amount = vestingAmount + rewardAmount;

        /* Update globals */
        totalStakedAmount -= vestingAmount;
        totalPendingRewardAmount -= rewardAmount;
        totalRewardAmountClaimed += rewardAmount;

        plan.stakedAmount -= vestingAmount;

        // Delete stake if stakedAmount becomes 0
        if (stake.stakedAmount == 0) {
            delete stakes[msg.sender][_stakeIndex]; //Sets state to 0
            /* decrement plan active count */
            plan.usageCount--;
        }

        emit StakeWithdrawn(_stakeIndex, vestingAmount, rewardAmount);

        status = IERC20(gcrToken).transfer(msg.sender, amount);
        require(status, "GCRStaking: transfer to user failed");
    }

    /**
     * @notice leave/withdraw staking without receiving any rewards, can be
     * used for abrupt withdraws.
     * @param _stakeIndex index of the stake
     */
    function emergencyWithdraw(uint256 _stakeIndex) external {
        require(_stakeIndex < MAX_NUM_OF_STAKES_PER_USER, "GCRStaking: invalid stake index");

        Stake storage stake = stakes[msg.sender][_stakeIndex];
        require(stake.state == 1, "GCRStaking: stake is not active");

        uint256 amount = stake.stakedAmount;

        totalStakedAmount -= amount;
        totalPendingRewardAmount -= stake.rewardAmount;

        /* decrement plan active count */
        plans[stake.plan].usageCount--;

        delete stakes[msg.sender][_stakeIndex]; //Sets state to 0

        emit EmergencyWithdraw(msg.sender, _stakeIndex);

        bool status = IERC20(gcrToken).transfer(msg.sender, amount);
        require(status, "GCRStaking: transfer to user failed");
    }

    function transferExcessReward(address _to) external onlyOwner {
        uint256 excessAmount = IERC20(gcrToken).balanceOf(address(this));

        if (excessAmount > 0) {
            excessAmount = excessAmount - (totalStakedAmount + totalPendingRewardAmount);
            IERC20(gcrToken).transfer(_to, excessAmount);
        }
    }

    /**
     * @notice returns stakes ids of a stake holder
     * @param stakeHolder address of the staker
     * @return stakesIndexes array of stake indices
     * @return numStakes number of stakes
     */
    function getStakesIndexes(address stakeHolder)
        external
        view
        returns (uint256[] memory stakesIndexes, uint256 numStakes)
    {
        uint256 i;
        uint256 j;

        for (i = 0; i < MAX_NUM_OF_STAKES_PER_USER; i++) if (stakes[stakeHolder][i].state == 1) numStakes++;

        if (numStakes > 0) {
            stakesIndexes = new uint256[](numStakes);
            j = 0;
            for (i = 0; i < MAX_NUM_OF_STAKES_PER_USER; i++) {
                if (stakes[stakeHolder][i].state == 1) {
                    stakesIndexes[j] = i;
                    j++;
                }
            }
        }
    }

    /**
     * @notice get details of a stake given staker and stake id
     * @param stakeHolder address of the stake holder
     * @param _stakeIndex index of the stake
     */
    function getStakeInfo(address stakeHolder, uint256 _stakeIndex)
        external
        view
        returns (
            uint256 stakeAmount,
            uint256 createdAt,
            uint256 rewardAmount,
            uint256 lastVestingTime,
            string memory plan
        )
    {
        if (_stakeIndex < MAX_NUM_OF_STAKES_PER_USER && stakes[stakeHolder][_stakeIndex].state == 1) {
            stakeAmount = stakes[stakeHolder][_stakeIndex].stakedAmount;
            createdAt = stakes[stakeHolder][_stakeIndex].createdAt;
            plan = stakes[stakeHolder][_stakeIndex].plan;
            rewardAmount = stakes[stakeHolder][_stakeIndex].rewardAmount;
            lastVestingTime = stakes[stakeHolder][_stakeIndex].lastVestingTime;
        }
    }

    /**
     * @notice get total staked amount in a given plan
     * @param _plan name of the plan
     * @return stakedAmount total staked amount in the plan
     */
    function getStakedAmountByPlan(string memory _plan) external view onlyOwner returns (uint256) {
        if (plans[_plan].state > 0) return plans[_plan].stakedAmount;

        return 0;
    }

    /**
     * @notice get total staked amount in all plans given the user address
     * @param stakeHolder address of the staker
     * @return stakedAmount total staked amount of the user, in all plans.
     */
    function getUserStakedAmount(address stakeHolder) external view returns (uint256 stakedAmount) {
        uint256 i;

        for (i = 0; i < MAX_NUM_OF_STAKES_PER_USER; i++)
            if (stakes[stakeHolder][i].state == 1) {
                stakedAmount += stakes[stakeHolder][i].stakedAmount;
            }
    }

    /**
     * @notice pause staking. New stakes are not allowed once paused, only
     * for owner.
     */
    function pauseStaking() external onlyOwner {
        if (!stakingPaused) stakingPaused = true;
    }

    /**
     * @notice resume paused staking. New stakes are allowed once resumed,
     * only for owner.
     */
    function resumeStaking() external onlyOwner {
        if (stakingPaused) stakingPaused = false;
    }

    /**
     * @notice A method to update 'rewaredAccount', only for owner.
     */
    function updateRewardAccount(address _rewardAccount) external onlyOwner {
        require(_rewardAccount != address(0), "GCRStaking: invalid address");

        rewardAccount = _rewardAccount;
    }

    function _calculateVestingAmount(Stake storage stake, Plan storage plan) internal returns (uint256, uint256) {
        uint256 temp = block.timestamp - stake.lastVestingTime;
        uint256 temp1 = plan.vestingPeriod * 1 days;

        if (temp < temp1) return (0, 0);

        uint256 vestedTimes = temp / temp1;

        // set last withdrawn time to immeditely after the vestingPeriod.
        stake.lastVestingTime += (vestedTimes * temp1);

        temp = stake.vestingAmount * vestedTimes;
        temp1 = stake.vestingReward * vestedTimes;

        // handle last vesting period properly
        if ((temp > stake.stakedAmount) || ((stake.stakedAmount - temp) < stake.vestingAmount))
            temp = stake.stakedAmount;

        if ((temp1 > stake.rewardAmount) || ((stake.rewardAmount - temp1) < stake.vestingReward))
            temp1 = stake.rewardAmount;

        return (temp, temp1);
    }

    // Plans management
    /**
     * @notice create a staking plan
     * @param _name name of the plan, must be unique
     * @param _minimumStake minimum amount to stake in this plan
     * @param _duration duration of the plan in days
     * @param _rewardPercent percentage of the reward for the duration
     */
    function createPlan(
        string calldata _name,
        uint256 _minimumStake,
        uint256 _duration,
        uint256 _rewardPercent,
        uint256 _vestingPeriod
    ) external onlyOwner {
        require(_duration > 0, "GCRStaking: duration can't be zero");
        require(_minimumStake > 0, "GCRStaking: minimum stake can't be zero");
        require(plans[_name].state == 0, "GCRStaking: plan already exists");
        require(_vestingPeriod <= _duration, "GCRStaking: invalid versting period");

        Plan storage plan = plans[_name];

        plan.name = _name;
        plan.minimumStake = _minimumStake;
        plan.durationInDays = _duration;
        plan.rewardPercent = _rewardPercent;
        if (_vestingPeriod > 0) plan.vestingPeriod = _vestingPeriod;
        else plan.vestingPeriod = _duration;

        plan.state = 1;

        emit PlanCreated(plan.name, plan.durationInDays, plan.rewardPercent);
    }

    /**
     * @notice delete a plan, if not active, only owner.
     * @param _name plan name
     */
    function deletePlan(string calldata _name) external onlyOwner {
        require(plans[_name].state > 0, "GCRStaking: plan not found");
        require(plans[_name].usageCount == 0, "GCRStaking: plan is in use");

        delete plans[_name];

        emit PlanDeleted(_name);
    }

    /**
     * @notice disable a plan. No more new stakes will be added with this plan.
     * @param _name the plan name to disable
     */
    function disablePlan(string calldata _name) external onlyOwner {
        require(plans[_name].state == 1, "GCRStaking: invalid plan or already disabled");
        plans[_name].state = 2; //Disable
    }

    /**
     * @notice retrieve the plan information given its name.
     * @param _name plan name to retrieve
     */
    function getPlanInfo(string calldata _name)
        external
        view
        returns (
            uint256 minimumStake,
            uint256 duration,
            uint256 rewardPercentage,
            uint256 usageCount,
            uint8 state,
            uint256 vestingPeriod,
            uint256 stakedAmount
        )
    {
        Plan storage plan = plans[_name];

        if (plan.state > 0) {
            minimumStake = plan.minimumStake;
            duration = plan.durationInDays;
            rewardPercentage = plan.rewardPercent;
            usageCount = plan.usageCount;
            state = plan.state;
            vestingPeriod = plan.vestingPeriod;
            stakedAmount = plan.stakedAmount;
        }
    }
}
