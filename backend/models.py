from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from database import Base
import datetime

class Agent(Base):
    __tablename__ = "ai_agents"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    wallet_address = Column(String)
    trust_score = Column(Float, default=50.0)
    roi = Column(Float, default=0.0)
    winrate = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Trade(Base):
    __tablename__ = "trades"
    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer)
    symbol = Column(String)
    action = Column(String)
    confidence = Column(Float)
    price = Column(Float)
    pnl = Column(Float, default=0.0)
    tx_hash = Column(String, nullable=True)
    status = Column(String, default="OPEN")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    id         = Column(Integer, primary_key=True, index=True)
    username   = Column(String, unique=True, index=True)
    email      = Column(String, unique=True, index=True)
    hashed_pw  = Column(String)
    is_admin   = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class ThoughtStream(Base):
    __tablename__ = "thought_streams"
    id = Column(Integer, primary_key=True, index=True)
    agent_name = Column(String)
    message = Column(String)
    msg_type = Column(String) # INFO, ALERT, ACTION, RISK
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
