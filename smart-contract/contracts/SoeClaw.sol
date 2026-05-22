// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SoeClaw {
    struct Trade {
        uint256 id;
        string agentName;
        string symbol;
        string action;
        uint256 timestamp;
        uint256 confidence;
    }

    Trade[] public trades;
    mapping(string => uint256) public agentReputation;
    address public owner;

    event TradeExecuted(
        uint256 indexed id,
        string agentName,
        string symbol,
        string action,
        uint256 timestamp,
        uint256 confidence
    );

    event AgentTriggered(string agentName, uint256 timestamp);

    constructor() {
        owner = msg.sender;
    }

    function addTrade(
        string memory _agentName,
        string memory _symbol,
        string memory _action,
        uint256 _confidence
    ) public {
        uint256 tradeId = trades.length;
        trades.push(Trade(
            tradeId,
            _agentName,
            _symbol,
            _action,
            block.timestamp,
            _confidence
        ));

        agentReputation[_agentName] += 1;

        emit TradeExecuted(tradeId, _agentName, _symbol, _action, block.timestamp, _confidence);
    }

    function triggerAgent(string memory _agentName) public {
        emit AgentTriggered(_agentName, block.timestamp);
    }

    function getTradesCount() public view returns (uint256) {
        return trades.length;
    }

    function getAgentReputation(string memory _agentName) public view returns (uint256) {
        return agentReputation[_agentName];
    }
}
