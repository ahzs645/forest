/**
 * Game Models and Data Structures
 * Contains all the core data classes and enums for the BC Forestry Simulator
 */

export const PermitStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  DENIED: "denied",
  DELAYED: "delayed",
};

export const CertificationType = {
  FSC: "FSC", // Forest Stewardship Council
  PEFC: "PEFC", // Programme for Endorsement of Forest Certification
  SFI: "SFI", // Sustainable Forestry Initiative
};

export const DisasterType = {
  BEETLE_KILL: "beetle_kill",
  WILDFIRE: "wildfire",
  WINDSTORM: "windstorm",
  DROUGHT: "drought",
  FLOOD: "flood",
};

export class HarvestBlock {
  constructor({
    id,
    volume_m3,
    year_planned,
    permit_status = PermitStatus.PENDING,
    permit_submitted = 0,
    processing_time = 0,
    first_nations_agreement = false,
    heritage_cleared = false,
    old_growth_affected = false,
    priority = 1, // 1=low, 2=medium, 3=high
    disaster_affected = false,
    disaster_type = null,
    volume_loss_percent = 0.0,
    fn_consulted = false,
    log_grade_distribution = { sawlogs: 0.6, pulp: 0.3, firewood: 0.1 },
  }) {
    this.id = id;
    this.volume_m3 = volume_m3;
    this.year_planned = year_planned;
    this.permit_status = permit_status;
    this.permit_submitted = permit_submitted;
    this.processing_time = processing_time;
    this.first_nations_agreement = first_nations_agreement;
    this.heritage_cleared = heritage_cleared;
    this.old_growth_affected = old_growth_affected;
    this.priority = priority;
    this.disaster_affected = disaster_affected;
    this.disaster_type = disaster_type;
    this.volume_loss_percent = volume_loss_percent;
    this.fn_consulted = fn_consulted;
    this.log_grade_distribution = log_grade_distribution;
  }
}

export class FirstNation {
  constructor({
    name,
    relationship_level = 0.5, // 0-1 scale
    treaty_area = false,
    active_negotiations = false,
    agreement_signed = false,
    consultation_cost = 8000,
    last_consultation_year = 0,
    consultation_frequency_required = 2, // Years
  }) {
    this.name = name;
    this.relationship_level = relationship_level;
    this.treaty_area = treaty_area;
    this.active_negotiations = active_negotiations;
    this.agreement_signed = agreement_signed;
    this.consultation_cost = consultation_cost;
    this.last_consultation_year = last_consultation_year;
    this.consultation_frequency_required = consultation_frequency_required;
  }

  needs_consultation(current_year) {
    return (
      current_year - this.last_consultation_year >=
      this.consultation_frequency_required
    );
  }
}

export class Certification {
  constructor({
    cert_type,
    obtained_year = 0,
    annual_cost = 25000,
    revenue_bonus = 0.15,
    reputation_bonus = 0.1,
    active = false,
  }) {
    this.cert_type = cert_type;
    this.obtained_year = obtained_year;
    this.annual_cost = annual_cost;
    this.revenue_bonus = revenue_bonus;
    this.reputation_bonus = reputation_bonus;
    this.active = active;
  }
}

export class GameState {
  constructor() {
    this.year = 2025;
    this.quarter = 1; // Q1, Q2, Q3, Q4
    this.budget = 2500000;
    this.reputation = 0.5;
    this.survival_bonus = 0.0;
    this.permit_bonus = 0.0;
    this.region = "";
    this.species = "";
    this.prep = 0;
    this.training = 0;

    // Enhanced game elements
    this.annual_allowable_cut = 150000; // m3/year
    this.aac_decline_rate = 0.03; // 3% per year
    this.harvest_blocks = [];
    this.first_nations = [];
    this.certifications = [];
    this.mill_capacity = 100000; // m3/year
    this.jobs_created = 0;
    this.biodiversity_score = 0.5;
    this.cumulative_disturbance = 0.0; // hectares
    this.disturbance_cap = 50000; // Blueberry River style cap

    // Policy tracking
    this.glyphosate_banned = false;
    this.old_growth_deferrals_expanded = false;
    this.permit_backlog_days = 120;

    // Economic tracking
    this.log_prices = {
      sawlogs: 120, // $/m3
      pulp: 60,     // $/m3
      firewood: 30  // $/m3
    };
    this.operating_cost_per_m3 = 45;
    this.total_revenue = 0;
    this.total_costs = 0;

    // Win condition tracking
    this.years_operated = 0;
    this.consecutive_profitable_years = 0;
    this.social_license_maintained = true;

    // Community & story progression
    this.community_support = 0.5; // 0-1 scale
    this.story_stage = 0;
    this.story_branch = null;

    // First Nations liaison and CEO
    this.fn_liaison = null;
    this.ceo = null;
    this.quarterly_profit = 0;
    
    // Safety and criminal tracking
    this.safety_violations = 0;
    this.safety_fatalities = 0;
    this.equipment_condition = 1.0; // 0-1 scale
    this.under_criminal_investigation = false;
    this.criminal_convictions = 0;
    
    // Company name
    this.companyName = "Northern Forest Solutions";
  }

  get_active_certifications() {
    return this.certifications.filter((c) => c.active);
  }

  get_certification_revenue_bonus() {
    return this.get_active_certifications().reduce(
      (total, c) => total + c.revenue_bonus,
      0
    );
  }

  get_certification_reputation_bonus() {
    return this.get_active_certifications().reduce(
      (total, c) => total + c.reputation_bonus,
      0
    );
  }
}
