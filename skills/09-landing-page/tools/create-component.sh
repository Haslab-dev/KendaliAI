#!/bin/bash
set -e

COMPONENT="$1"
OUTPUT="$2"

if [ -z "$COMPONENT" ]; then
    echo "Usage: $0 <component-name> [output-dir]"
    exit 1
fi

OUTPUT_DIR="${2:-components}"
mkdir -p "$OUTPUT_DIR"

echo "🎨 Creating component: $COMPONENT"

case "$COMPONENT" in
    hero)
        cat > "$OUTPUT_DIR/hero.html" << 'EOF'
<section class="hero">
  <h1>Build Amazing Products</h1>
  <p>The best solution for your business needs</p>
  <button>Get Started</button>
</section>
EOF
        ;;
    features)
        cat > "$OUTPUT_DIR/features.html" << 'EOF'
<section class="features">
  <div class="feature"><h3>Fast</h3><p>Lightning quick performance</p></div>
  <div class="feature"><h3>Secure</h3><p>Enterprise-grade security</p></div>
  <div class="feature"><h3>Reliable</h3><p>99.9% uptime guarantee</p></div>
</section>
EOF
        ;;
    pricing)
        cat > "$OUTPUT_DIR/pricing.html" << 'EOF'
<section class="pricing">
  <div class="plan"><h3>Starter</h3><p>$9/mo</p></div>
  <div class="plan"><h3>Pro</h3><p>$29/mo</p></div>
  <div class="plan"><h3>Enterprise</h3><p>Contact us</p></div>
</section>
EOF
        ;;
    cta)
        cat > "$OUTPUT_DIR/cta.html" << 'EOF'
<section class="cta">
  <h2>Ready to get started?</h2>
  <button>Sign up free</button>
</section>
EOF
        ;;
esac

echo "✅ Component created: $OUTPUT_DIR/$COMPONENT.html"
