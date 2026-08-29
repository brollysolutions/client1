"""Split campaign artwork usage types by surface and seed dashboard artwork.

One `public_banner` bucket covered the 9:5 homepage hero and both 5:2 section
carousels, so the Media Library could not tell a Sub Admin which surface an
asset belonged to and validation could not reject artwork shaped for a
different one. `homepage_banner` and `section_banner` replace it; the legacy
value stays accepted so pre-split rows remain readable.

Dashboard banners and dashboard offers shipped with no artwork at all. The
bundled rows added here come from `scripts/build_dashboard_artwork.py`, which
recomposes them from campaign WebPs already licensed in this repository.

Revision ID: b7c9d1e3f5a8
Revises: a6b8c0d2e4f7
Create Date: 2026-08-29
"""

from __future__ import annotations

from alembic import op

revision = "b7c9d1e3f5a8"
down_revision = "a6b8c0d2e4f7"
branch_labels = None
depends_on = None

_SPLIT_USAGE_TYPES = (
    "usage_type IN ('homepage_banner', 'section_banner', 'sponsor', "
    "'dashboard_banner', 'dashboard_offer', 'campaign', 'public_banner')"
)
_ORIGINAL_USAGE_TYPES = (
    "usage_type IN ('public_banner', 'sponsor', 'dashboard_banner', 'dashboard_offer', 'campaign')"
)


def upgrade() -> None:
    # Widen before rewriting: the backfill below writes values the original
    # constraint would reject.
    op.drop_constraint("ck_campaign_media_usage_type", "campaign_media_assets", type_="check")
    op.create_check_constraint(
        "ck_campaign_media_usage_type", "campaign_media_assets", _SPLIT_USAGE_TYPES
    )

    # Every existing public_banner asset was generated for one governed
    # template, so that template's placement is the authority on which surface
    # it serves. An asset with no template keeps the legacy value rather than
    # being guessed into the wrong bucket.
    op.execute(
        """
        UPDATE campaign_media_assets AS media
        SET usage_type = CASE template.placement::text
                WHEN 'homepage' THEN 'homepage_banner'
                ELSE 'section_banner'
            END,
            updated_at = now()
        FROM banner_templates AS template
        WHERE template.media_asset_id = media.id
          AND media.usage_type = 'public_banner'
          AND template.placement::text IN ('homepage', 'financial_services', 'properties')
        """
    )

    op.execute(
        """
        INSERT INTO campaign_media_assets (
            business_line, usage_type, title, alt_text, tags, image_ref,
            mime_type, width, height, byte_size, source_type, source_reference, active
        ) VALUES
        ('loans', 'dashboard_banner',
         'Loan progress',
         'A borrower reviewing the progress of a loan application',
         '["loans", "progress", "application"]'::jsonb,
         '/banner-templates/dashboard/loan-progress.webp',
         'image/webp', 1296, 720, 38038,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('both', 'dashboard_banner',
         'Document upload',
         'Paperwork being prepared for a lending application',
         '["documents", "upload", "verification"]'::jsonb,
         '/banner-templates/dashboard/document-upload.webp',
         'image/webp', 1296, 720, 49284,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('both', 'dashboard_banner',
         'Referral boost',
         'Two people sharing a referral recommendation',
         '["referral", "rewards", "sharing"]'::jsonb,
         '/banner-templates/dashboard/referral-boost.webp',
         'image/webp', 1296, 720, 44132,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('both', 'dashboard_banner',
         'Complete your profile',
         'A customer completing an account profile',
         '["profile", "onboarding", "account"]'::jsonb,
         '/banner-templates/dashboard/profile-complete.webp',
         'image/webp', 1296, 720, 41238,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('real_estate', 'dashboard_banner',
         'Saved property',
         'A contemporary residence saved to a shortlist',
         '["property", "shortlist", "saved"]'::jsonb,
         '/banner-templates/dashboard/property-saved.webp',
         'image/webp', 1296, 720, 50916,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('both', 'dashboard_banner',
         'Agent payout',
         'Earnings and rewards prepared for payout',
         '["agent", "payout", "commission"]'::jsonb,
         '/banner-templates/dashboard/agent-payout.webp',
         'image/webp', 1296, 720, 25592,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('both', 'dashboard_offer',
         'Cashback offer',
         'A payment card presented for a cashback benefit',
         '["cashback", "card", "reward"]'::jsonb,
         '/banner-templates/dashboard_offer/cashback.webp',
         'image/webp', 1120, 490, 32954,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('both', 'dashboard_offer',
         'Festive offer',
         'A festive seasonal promotion scene',
         '["festive", "seasonal", "promotion"]'::jsonb,
         '/banner-templates/dashboard_offer/festive.webp',
         'image/webp', 1120, 490, 42930,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('loans', 'dashboard_offer',
         'Fee waiver',
         'A borrower reviewing waived processing charges',
         '["fee", "waiver", "processing"]'::jsonb,
         '/banner-templates/dashboard_offer/fee-waiver.webp',
         'image/webp', 1120, 490, 32488,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('both', 'dashboard_offer',
         'Partner deal',
         'Two business partners agreeing a joint offer',
         '["partner", "deal", "business"]'::jsonb,
         '/banner-templates/dashboard_offer/partner-deal.webp',
         'image/webp', 1120, 490, 35042,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('loans', 'dashboard_offer',
         'Reduced interest rate',
         'A home loan customer reviewing a reduced rate',
         '["interest", "rate", "home loan"]'::jsonb,
         '/banner-templates/dashboard_offer/interest-cut.webp',
         'image/webp', 1120, 490, 47116,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('both', 'dashboard_offer',
         'Travel offer',
         'A traveller preparing for a covered journey',
         '["travel", "journey", "insurance"]'::jsonb,
         '/banner-templates/dashboard_offer/travel.webp',
         'image/webp', 1120, 490, 52806,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('both', 'dashboard_offer',
         'Shopping offer',
         'A shopper redeeming a retail benefit',
         '["shopping", "retail", "benefit"]'::jsonb,
         '/banner-templates/dashboard_offer/shopping.webp',
         'image/webp', 1120, 490, 37224,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true),
        ('both', 'dashboard_offer',
         'Insurance offer',
         'A family reviewing health cover together',
         '["insurance", "health", "cover"]'::jsonb,
         '/banner-templates/dashboard_offer/insurance.webp',
         'image/webp', 1120, 490, 39734,
         'bundled', 'Recomposed via scripts/build_dashboard_artwork.py', true)
        ON CONFLICT (image_ref) DO NOTHING
        """
    )


def downgrade() -> None:
    # Seeded rows are removed only while nothing references them; a campaign
    # built on one must keep its artwork.
    op.execute(
        """
        DELETE FROM campaign_media_assets
        WHERE source_type = 'bundled'
          AND (
            image_ref LIKE '/banner-templates/dashboard/%'
            OR image_ref LIKE '/banner-templates/dashboard_offer/%'
          )
          AND NOT EXISTS (
            SELECT 1 FROM banner_templates
            WHERE media_asset_id = campaign_media_assets.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM banners WHERE media_asset_id = campaign_media_assets.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM offers WHERE media_asset_id = campaign_media_assets.id
          )
        """
    )
    op.execute(
        """
        UPDATE campaign_media_assets
        SET usage_type = 'public_banner'
        WHERE usage_type IN ('homepage_banner', 'section_banner')
        """
    )
    op.drop_constraint("ck_campaign_media_usage_type", "campaign_media_assets", type_="check")
    op.create_check_constraint(
        "ck_campaign_media_usage_type", "campaign_media_assets", _ORIGINAL_USAGE_TYPES
    )
