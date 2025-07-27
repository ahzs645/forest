"""
Certification System
Handles forest certification programs that allow premium timber sales
"""

import random
from game_models import GameState, Certification, CertificationType
from utils import ask, print_subsection, format_currency


def certification_opportunities(state: GameState):
    """Present certification opportunities to the player."""
    available_certs = []
    
    # Check which certifications are available
    current_cert_types = {c.cert_type for c in state.certifications if c.active}
    
    for cert_type in CertificationType:
        if cert_type not in current_cert_types:
            available_certs.append(cert_type)
    
    if not available_certs:
        return
    
    print_subsection("FOREST CERTIFICATION OPPORTUNITIES")
    print("Available certification programs:")
    
    cert_info = {
        CertificationType.FSC: {
            "name": "Forest Stewardship Council (FSC)",
            "cost": 150000,
            "annual": 25000,
            "premium": 0.20,
            "reputation": 0.15,
            "requirements": "Strict environmental and social standards"
        },
        CertificationType.PEFC: {
            "name": "Programme for Endorsement of Forest Certification (PEFC)", 
            "cost": 100000,
            "annual": 18000,
            "premium": 0.15,
            "reputation": 0.10,
            "requirements": "National forest certification framework"
        },
        CertificationType.SFI: {
            "name": "Sustainable Forestry Initiative (SFI)",
            "cost": 80000,
            "annual": 15000,
            "premium": 0.12,
            "reputation": 0.08,
            "requirements": "Fiber sourcing and forest management standards"
        }
    }
    
    for i, cert_type in enumerate(available_certs):
        info = cert_info[cert_type]
        print(f"\n{i+1}. {info['name']}")
        print(f"   Initial cost: {format_currency(info['cost'])}")
        print(f"   Annual cost: {format_currency(info['annual'])}")
        print(f"   Revenue premium: +{info['premium']*100:.0f}% on certified timber")
        print(f"   Reputation bonus: +{info['reputation']:.2f}")
        print(f"   Requirements: {info['requirements']}")
    
    options = [f"Apply for {cert_info[cert]['name']}" for cert in available_certs]
    options.append("Skip certification this year")
    
    choice = ask("Choose certification program:", options)
    
    if choice < len(available_certs):
        cert_type = available_certs[choice]
        info = cert_info[cert_type]
        
        if state.budget < info['cost']:
            print(f"Insufficient budget! Need {format_currency(info['cost'])}")
            return
        
        # Check if player meets requirements
        if _check_certification_requirements(state, cert_type):
            state.budget -= info['cost']
            
            certification = Certification(
                cert_type=cert_type,
                obtained_year=state.year,
                annual_cost=info['annual'],
                revenue_bonus=info['premium'],
                reputation_bonus=info['reputation'],
                active=True
            )
            
            state.certifications.append(certification)
            state.reputation += info['reputation']
            
            print(f"✓ {info['name']} certification obtained!")
            print(f"  Cost: {format_currency(info['cost'])}")
            print(f"  Annual revenue premium: +{info['premium']*100:.0f}%")
            print(f"  Reputation bonus: +{info['reputation']:.2f}")
            
        else:
            print(f"❌ Certification requirements not met for {info['name']}")
            _explain_certification_requirements(cert_type, state)


def _check_certification_requirements(state: GameState, cert_type: CertificationType) -> bool:
    """Check if the player meets certification requirements."""
    
    if cert_type == CertificationType.FSC:
        # FSC has the strictest requirements
        requirements = [
            state.reputation >= 0.6,  # Good reputation
            state.biodiversity_score >= 0.5,  # Decent biodiversity
            state.cumulative_disturbance < state.disturbance_cap * 0.8,  # Low disturbance
            all(fn.relationship_level >= 0.5 for fn in state.first_nations),  # Good FN relations
            not any(b.disaster_affected for b in state.harvest_blocks[-5:])  # No recent disasters
        ]
        return all(requirements)
        
    elif cert_type == CertificationType.PEFC:
        # PEFC has moderate requirements
        requirements = [
            state.reputation >= 0.4,
            state.biodiversity_score >= 0.4,
            state.cumulative_disturbance < state.disturbance_cap * 0.9,
            any(fn.agreement_signed for fn in state.first_nations)  # At least one FN agreement
        ]
        return all(requirements)
        
    elif cert_type == CertificationType.SFI:
        # SFI has basic requirements
        requirements = [
            state.reputation >= 0.3,
            state.biodiversity_score >= 0.3,
            state.social_license_maintained
        ]
        return all(requirements)
    
    return False


def _explain_certification_requirements(cert_type: CertificationType, state: GameState):
    """Explain why certification was denied."""
    print("\nCertification requirements not met:")
    
    if cert_type == CertificationType.FSC:
        if state.reputation < 0.6:
            print(f"  ❌ Reputation too low: {state.reputation:.2f}/0.60")
        if state.biodiversity_score < 0.5:
            print(f"  ❌ Biodiversity score too low: {state.biodiversity_score:.2f}/0.50")
        if state.cumulative_disturbance >= state.disturbance_cap * 0.8:
            ratio = state.cumulative_disturbance / state.disturbance_cap
            print(f"  ❌ Disturbance ratio too high: {ratio:.1%}/80%")
        if not all(fn.relationship_level >= 0.5 for fn in state.first_nations):
            poor_relations = [fn.name for fn in state.first_nations if fn.relationship_level < 0.5]
            print(f"  ❌ Poor First Nations relationships: {', '.join(poor_relations)}")
        if any(b.disaster_affected for b in state.harvest_blocks[-5:]):
            print(f"  ❌ Recent forest health issues in harvest areas")
            
    elif cert_type == CertificationType.PEFC:
        if state.reputation < 0.4:
            print(f"  ❌ Reputation too low: {state.reputation:.2f}/0.40")
        if state.biodiversity_score < 0.4:
            print(f"  ❌ Biodiversity score too low: {state.biodiversity_score:.2f}/0.40")
        if state.cumulative_disturbance >= state.disturbance_cap * 0.9:
            ratio = state.cumulative_disturbance / state.disturbance_cap
            print(f"  ❌ Disturbance ratio too high: {ratio:.1%}/90%")
        if not any(fn.agreement_signed for fn in state.first_nations):
            print(f"  ❌ No signed First Nations agreements")
            
    elif cert_type == CertificationType.SFI:
        if state.reputation < 0.3:
            print(f"  ❌ Reputation too low: {state.reputation:.2f}/0.30")
        if state.biodiversity_score < 0.3:
            print(f"  ❌ Biodiversity score too low: {state.biodiversity_score:.2f}/0.30")
        if not state.social_license_maintained:
            print(f"  ❌ Social license to operate has been lost")


def maintain_certifications(state: GameState):
    """Handle annual certification maintenance and audits."""
    active_certs = state.get_active_certifications()
    
    if not active_certs:
        return
    
    print_subsection("CERTIFICATION MAINTENANCE")
    
    total_annual_cost = sum(cert.annual_cost for cert in active_certs)
    
    print(f"Active certifications: {len(active_certs)}")
    for cert in active_certs:
        cert_name = cert.cert_type.value
        years_held = state.year - cert.obtained_year
        print(f"  - {cert_name}: {years_held} years held, {format_currency(cert.annual_cost)}/year")
    
    print(f"Total annual certification costs: {format_currency(total_annual_cost)}")
    
    if state.budget < total_annual_cost:
        print("⚠️  Insufficient budget to maintain all certifications!")
        
        # Player must choose which certifications to keep
        options = []
        for cert in active_certs:
            options.append(f"Drop {cert.cert_type.value} certification")
        options.append("Find budget elsewhere (risk bankruptcy)")
        
        choice = ask("Action required:", options)
        
        if choice < len(active_certs):
            dropped_cert = active_certs[choice]
            dropped_cert.active = False
            state.reputation -= dropped_cert.reputation_bonus * 0.5  # Penalty for dropping
            print(f"❌ {dropped_cert.cert_type.value} certification dropped")
            print(f"  Reputation penalty: -{dropped_cert.reputation_bonus * 0.5:.2f}")
            
            # Recalculate costs
            total_annual_cost = sum(cert.annual_cost for cert in state.get_active_certifications())
        else:
            print("Proceeding with full certification costs...")
    
    # Pay for remaining certifications
    if state.budget >= total_annual_cost:
        state.budget -= total_annual_cost
        print(f"✓ All certifications maintained - cost: {format_currency(total_annual_cost)}")
        
        # Audit process - chance of issues
        for cert in state.get_active_certifications():
            if not _pass_certification_audit(state, cert.cert_type):
                print(f"⚠️  {cert.cert_type.value} audit found non-compliance issues")
                _handle_audit_failure(state, cert)
    else:
        # Force drop all certifications
        for cert in active_certs:
            cert.active = False
        state.reputation -= 0.3
        print("❌ All certifications lost due to non-payment")


def _pass_certification_audit(state: GameState, cert_type: CertificationType) -> bool:
    """Determine if certification audit passes."""
    # Use the same requirements as initial certification
    return _check_certification_requirements(state, cert_type)


def _handle_audit_failure(state: GameState, cert: Certification):
    """Handle certification audit failures."""
    print(f"Certification audit failure for {cert.cert_type.value}")
    
    options = [
        f"Implement corrective action plan ({format_currency(50000)})",
        f"Accept certification suspension",
        f"Appeal audit findings ({format_currency(25000)})"
    ]
    
    choice = ask("Response to audit failure:", options)
    
    if choice == 0:  # Corrective action
        if state.budget >= 50000:
            state.budget -= 50000
            print("✓ Corrective action plan implemented")
            # Improve scores slightly
            state.reputation += 0.05
            state.biodiversity_score += 0.05
        else:
            print("Insufficient budget for corrective action")
            cert.active = False
            
    elif choice == 1:  # Accept suspension
        cert.active = False
        state.reputation -= cert.reputation_bonus * 0.3
        print(f"❌ {cert.cert_type.value} certification suspended")
        
    else:  # Appeal
        if state.budget >= 25000:
            state.budget -= 25000
            if random.random() < 0.4:  # 40% chance of successful appeal
                print("✓ Appeal successful - certification maintained")
            else:
                print("❌ Appeal failed - certification suspended")
                cert.active = False
                state.reputation -= cert.reputation_bonus * 0.2
        else:
            print("Insufficient budget for appeal")
            cert.active = False