"""
Game Models and Data Structures
Contains all the core data classes and enums for the BC Forestry Simulator
"""

from dataclasses import dataclass, field
from typing import List, Dict, Tuple
from enum import Enum


class PermitStatus(Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    DELAYED = "delayed"


class CertificationType(Enum):
    FSC = "FSC"  # Forest Stewardship Council
    PEFC = "PEFC"  # Programme for Endorsement of Forest Certification
    SFI = "SFI"  # Sustainable Forestry Initiative


class DisasterType(Enum):
    BEETLE_KILL = "beetle_kill"
    WILDFIRE = "wildfire" 
    WINDSTORM = "windstorm"
    DROUGHT = "drought"
    FLOOD = "flood"


@dataclass
class HarvestBlock:
    id: str
    volume_m3: int
    year_planned: int
    permit_status: PermitStatus = PermitStatus.PENDING
    permit_submitted: int = 0
    processing_time: int = 0
    first_nations_agreement: bool = False
    heritage_cleared: bool = False
    old_growth_affected: bool = False
    priority: int = 1  # 1=low, 2=medium, 3=high priority for permitting
    disaster_affected: bool = False
    disaster_type: DisasterType = None
    volume_loss_percent: float = 0.0


@dataclass
class FirstNation:
    name: str
    relationship_level: float = 0.5  # 0-1 scale
    treaty_area: bool = False
    active_negotiations: bool = False
    agreement_signed: bool = False
    consultation_cost: int = 8000
    last_consultation_year: int = 0
    consultation_frequency_required: int = 2  # Years between required consultations
    
    def needs_consultation(self, current_year: int) -> bool:
        return (current_year - self.last_consultation_year) >= self.consultation_frequency_required


@dataclass
class Certification:
    cert_type: CertificationType
    obtained_year: int = 0
    annual_cost: int = 25000
    revenue_bonus: float = 0.15  # 15% premium on certified timber
    reputation_bonus: float = 0.1
    active: bool = False


@dataclass
class GameState:
    year: int = 2025
    quarter: int = 1  # Q1, Q2, Q3, Q4
    budget: int = 2500000
    reputation: float = 0.5
    survival_bonus: float = 0.0
    permit_bonus: float = 0.0
    region: str = ""
    species: str = ""
    prep: int = 0
    training: int = 0
    
    # Enhanced game elements
    annual_allowable_cut: int = 150000  # m3/year
    aac_decline_rate: float = 0.03  # 3% per year
    harvest_blocks: List[HarvestBlock] = field(default_factory=list)
    first_nations: List[FirstNation] = field(default_factory=list)
    certifications: List[Certification] = field(default_factory=list)
    mill_capacity: int = 100000  # m3/year
    jobs_created: int = 0
    biodiversity_score: float = 0.5
    cumulative_disturbance: float = 0.0  # hectares
    disturbance_cap: float = 50000  # Blueberry River style cap
    
    # Policy tracking
    glyphosate_banned: bool = False
    old_growth_deferrals_expanded: bool = False
    permit_backlog_days: int = 120  # Current government target: 25 days for wildfire, 40+ for others
    
    # Economic tracking
    revenue_per_m3: int = 85  # CAD
    operating_cost_per_m3: int = 45
    total_revenue: int = 0
    total_costs: int = 0
    
    # Win condition tracking
    years_operated: int = 0
    consecutive_profitable_years: int = 0
    social_license_maintained: bool = True
    
    # First Nations liaison and CEO
    fn_liaison: object = None  # Will hold LiaisonType object
    ceo: object = None  # Will hold CEOProfile object
    quarterly_profit: int = 0  # Tracks quarterly profit for CEO profit sharing
    
    def get_active_certifications(self) -> List[Certification]:
        return [c for c in self.certifications if c.active]
    
    def get_certification_revenue_bonus(self) -> float:
        return sum(c.revenue_bonus for c in self.get_active_certifications())
    
    def get_certification_reputation_bonus(self) -> float:
        return sum(c.reputation_bonus for c in self.get_active_certifications())