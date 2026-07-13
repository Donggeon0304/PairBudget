/**
 * formatCategory.ts
 * 
 * 카테고리 대메뉴/소메뉴를 일관된 형식으로 표시하는 공통 유틸
 */

import { Category } from '../types';

/**
 * 카테고리를 "대메뉴/소메뉴" 형식으로 표시
 * - group과 name이 같으면 대메뉴만 표시: "식비"
 * - group이 있고 다르면: "식비/외식"
 * - group이 없으면 name만 표시: "기타"
 */
export function formatCategoryLabel(
  categoryName: string,
  categoryGroup?: string | null,
): string {
  if (!categoryGroup || categoryGroup === categoryName) {
    return categoryName;
  }
  return `${categoryGroup}/${categoryName}`;
}

/**
 * Category 객체에서 표시명 생성
 */
export function formatCategoryFromObj(category: Category): string {
  return formatCategoryLabel(category.name, category.group);
}

/**
 * 대메뉴(group) 이름만 추출
 */
export function getCategoryGroup(
  categoryName: string,
  categoryGroup?: string | null,
): string {
  return categoryGroup || categoryName;
}
