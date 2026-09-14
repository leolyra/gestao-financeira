from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Boolean, Text
from sqlalchemy.sql import func
from app.core.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Account(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False) # checking, credit_card, investment
    pluggy_account_id = Column(String(100), nullable=True)
    balance = Column(Numeric(14, 2), default=0.00)

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False) # income, expense
    color = Column(String(20), nullable=True)

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    description = Column(String(255), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    date = Column(DateTime, nullable=False)
    is_manual = Column(Boolean, default=False)
    pluggy_transaction_id = Column(String(100), nullable=True)

class Asset(Base):
    __tablename__ = "assets"
    id = Column(Integer, primary_key=True, index=True)
    ticker_current = Column(String(20), unique=True, index=True, nullable=False)
    name = Column(String(150), nullable=False)
    asset_type = Column(String(50), nullable=False) # Ação, FII, ETF, Renda Fixa, BDR

class AssetTickerHistory(Base):
    __tablename__ = "asset_ticker_history"
    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    ticker_old = Column(String(20), index=True, nullable=False)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())

class InvestmentTransaction(Base):
    __tablename__ = "investment_transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    operation_type = Column(String(50), nullable=False) # buy, sell, dividend, jcp, amortization
    quantity = Column(Numeric(14, 4), default=0)
    unit_price = Column(Numeric(14, 4), default=0)
    costs = Column(Numeric(14, 2), default=0.00)
    total_amount = Column(Numeric(14, 2), nullable=False)
    trade_date = Column(DateTime, nullable=False)
    source = Column(String(50), default="manual") # manual, sinacor_pdf, spreadsheet
    notes = Column(String(255), nullable=True)

class AssetAlert(Base):
    __tablename__ = "asset_alerts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    rule_type = Column(String(50), nullable=False) # target_price_buy, target_price_sell, min_yield, max_pvp
    target_value = Column(Numeric(14, 2), nullable=False)
    current_value = Column(Numeric(14, 2), nullable=True)
    is_triggered = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    notes = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AssetReport(Base):
    __tablename__ = "asset_reports"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    title = Column(String(200), nullable=False)
    report_type = Column(String(50), default="gerencial") # gerencial, fato_relevante, resultados
    published_at = Column(DateTime, nullable=True)
    ai_summary = Column(Text, nullable=False)
    key_points = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
