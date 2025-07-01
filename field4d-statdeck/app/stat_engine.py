import pandas as pd
from statsmodels.formula.api import ols
from statsmodels.stats.multicomp import pairwise_tukeyhsd, MultiComparison
import statsmodels.api as sm

# Helper function for compact letter display
def get_letters_report(mc, alpha=0.05):
    # Try to use statsmodels' multiletterreport if available
    try:
        from statsmodels.stats.multicomp import multiletterreport
        reject, _, _ = mc.allpairtest(sm.stats.ttest_ind, method='Holm', alpha=alpha)
        # multiletterreport expects a boolean array of rejections
        return multiletterreport(reject)
    except ImportError:
        # Fallback: simple implementation for Tukey
        # This is a basic version and may not cover all edge cases
        groups = mc.groupsunique
        n = len(groups)
        letters = [chr(65+i) for i in range(n)]
        return dict(zip(groups, letters))

def run_anova_tukey(df: pd.DataFrame, alpha=0.05):
    results = []
    for ts, group_df in df.groupby("timestamp"):
        labels = group_df["label"].unique().tolist()
        if len(labels) < 2:
            continue
        try:
            # Calculate group stats
            group_stats = {}
            for label, subdf in group_df.groupby("label"):
                n = int(subdf["value"].count())
                mean = float(subdf["value"].mean())
                se = float(subdf["value"].std(ddof=1) / n**0.5) if n > 1 else 0.0
                group_stats[label] = {
                    "mean": mean,
                    "standard_error": se,
                    "n": n
                }

            model = ols("value ~ C(label)", data=group_df).fit()
            anova_table = sm.stats.anova_lm(model, typ=2)
            p_value = anova_table["PR(>F)"].iloc[0]

            ts_result = {
                "timestamp": ts,
                "groups_tested": labels,
                "group_stats": group_stats,
                "significant_differences": [],
                "letters_report": None
            }

            if p_value < alpha:
                tukey = pairwise_tukeyhsd(endog=group_df['value'], groups=group_df['label'], alpha=alpha)
                for res in tukey.summary().data[1:]:
                    ts_result["significant_differences"].append({
                        "comparison": f"{res[0]} vs {res[1]}",
                        "p_value": float(res[4]),
                        "reject_null": bool(res[5])
                    })
                # Letters report
                mc = MultiComparison(group_df['value'], group_df['label'])
                try:
                    from statsmodels.stats.multicomp import multiletterreport
                    letters = multiletterreport(tukey.reject)
                except ImportError:
                    # fallback: use helper
                    letters = get_letters_report(mc, alpha=alpha)
                ts_result["letters_report"] = letters
            results.append(ts_result)
        except Exception as e:
            results.append({
                "timestamp": ts,
                "groups_tested": labels,
                "error": f"Statistical test failed: {str(e)}"
            })
    return results


def run_t_test(df: pd.DataFrame, alpha=0.05):
    # TODO: Implement t-test per timestamp
    return []


def run_dunnett(df: pd.DataFrame, alpha=0.05):
    # TODO: Implement Dunnett's test per timestamp
    return [] 